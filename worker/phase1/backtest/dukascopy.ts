/**
 * Forex & gold history from Dukascopy's public datafeed (free, no key, back to ~2003 for the major pairs).
 * Prices are BID. Two routes, chosen automatically by a probe:
 *   1. daily 1-minute candle files  .../{SYM}/{YYYY}/{MM0}/{DD}/BID_candles_min_1.bi5   (1 request per day - fast)
 *   2. hourly tick files            .../{SYM}/{YYYY}/{MM0}/{DD}/{HH}h_ticks.bi5           (24 requests per day - slow, documented format)
 * MM0 is the ZERO-based month. Files are LZMA-compressed. The candle record layout is INFERRED from the data
 * (continuity of open/close) and the price divisor from a plausibility range, so a wrong guess fails loudly, not silently.
 */
import { aggregate, appendBars, cachePath, intervalMs, lastOpenTime, sleep } from './data.ts';
import { lzmaDecode } from './lzma.ts';
import type { Candle } from '../types.ts';

const BASE = 'https://datafeed.dukascopy.com/datafeed';
const DAY = 86_400_000;

export interface DukaOptions { baseUrl?: string; concurrency?: number; log?: (m: string) => void; now?: () => number }

const PLAUSIBLE: Array<[RegExp, number, number]> = [
  [/^XAU/, 100, 20000],
  [/^XAG/, 2, 300],
  [/JPY$/, 40, 400],
  [/.*/, 0.2, 5],
];

export function detectDivisor(symbol: string, medianRaw: number): number {
  const [, lo, hi] = PLAUSIBLE.find(([re]) => re.test(symbol.toUpperCase()))!;
  for (const div of [100000, 1000, 100, 10, 1]) {
    const px = medianRaw / div;
    if (px >= lo && px <= hi) return div;
  }
  throw new Error(`ตรวจหาตัวหารราคาของ ${symbol} ไม่ได้ (ค่าดิบกลาง ${medianRaw}) — รูปแบบไฟล์อาจเปลี่ยน`);
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export interface CandleLayout { open: number; close: number; low: number; high: number }

/** Works out which of the 4 price columns is open/close/low/high from the data itself. rows = [t, c1, c2, c3, c4]. */
export function inferCandleLayout(rows: number[][]): CandleLayout {
  const maxCount = [0, 0, 0, 0], minCount = [0, 0, 0, 0];
  for (const r of rows) {
    const v = [r[1], r[2], r[3], r[4]];
    maxCount[v.indexOf(Math.max(...v))]++;
    minCount[v.indexOf(Math.min(...v))]++;
  }
  const high = maxCount.indexOf(Math.max(...maxCount));
  let low = minCount.indexOf(Math.max(...minCount));
  if (low === high) low = [0, 1, 2, 3].filter((i) => i !== high)[0];
  const [a, b] = [0, 1, 2, 3].filter((i) => i !== high && i !== low);
  let aOpen = 0, bOpen = 0; // open of a candle equals the close of the previous one
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1 + a] === rows[i - 1][1 + b]) aOpen++;
    if (rows[i][1 + b] === rows[i - 1][1 + a]) bOpen++;
  }
  return bOpen > aOpen ? { open: b, close: a, low, high } : { open: a, close: b, low, high };
}

/** Decode one day of 1-minute candles. */
export function decodeCandleFile(buf: Uint8Array, dayStartMs: number, symbol: string): Candle[] {
  if (buf.length === 0) return [];
  const raw = lzmaDecode(buf);
  if (raw.length === 0) return [];
  if (raw.length % 24 !== 0) throw new Error(`ไฟล์แท่งเทียนขนาดแปลก (${raw.length} ไบต์ ไม่หาร 24 ลงตัว)`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = raw.length / 24;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) rows.push([dv.getUint32(i * 24), dv.getUint32(i * 24 + 4), dv.getUint32(i * 24 + 8), dv.getUint32(i * 24 + 12), dv.getUint32(i * 24 + 16)]);
  const lay = n >= 3 ? inferCandleLayout(rows) : { open: 0, close: 1, low: 2, high: 3 };
  const div = detectDivisor(symbol, median(rows.map((r) => r[1 + lay.close])));
  const out: Candle[] = rows.map((r, i) => ({
    openTime: dayStartMs + r[0] * 1000, open: r[1 + lay.open] / div, high: r[1 + lay.high] / div, low: r[1 + lay.low] / div, close: r[1 + lay.close] / div,
    volume: dv.getFloat32(i * 24 + 20), closeTime: dayStartMs + r[0] * 1000 + 59_999,
  }));
  const consistent = out.filter((c) => c.high >= Math.max(c.open, c.close) - 1e-9 && c.low <= Math.min(c.open, c.close) + 1e-9).length / out.length;
  if (consistent < 0.99) throw new Error(`ถอดแท่งเทียนไม่สอดคล้อง (OHLC ถูกต้องเพียง ${(consistent * 100).toFixed(0)}%) — รูปแบบไฟล์อาจเปลี่ยน`);
  return out;
}

export interface Tick { t: number; bid: number }

/** Decode one hour of ticks (20-byte big-endian records: ms-in-hour, ask, bid, askVol, bidVol). */
export function decodeTickFile(buf: Uint8Array, hourStartMs: number, symbol: string): Tick[] {
  if (buf.length === 0) return [];
  const raw = lzmaDecode(buf);
  if (raw.length === 0) return [];
  if (raw.length % 20 !== 0) throw new Error(`ไฟล์ tick ขนาดแปลก (${raw.length} ไบต์ ไม่หาร 20 ลงตัว)`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = raw.length / 20;
  const bids: number[] = [];
  for (let i = 0; i < n; i++) bids.push(dv.getUint32(i * 20 + 8));
  const div = detectDivisor(symbol, median(bids));
  return bids.map((b, i) => ({ t: hourStartMs + dv.getUint32(i * 20), bid: b / div }));
}

export function ticksToBars(ticks: Tick[], barMs: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const k of ticks) {
    const bucket = Math.floor(k.t / barMs) * barMs;
    if (!cur || cur.openTime !== bucket) {
      if (cur) out.push(cur);
      cur = { openTime: bucket, open: k.bid, high: k.bid, low: k.bid, close: k.bid, volume: 1, closeTime: bucket + barMs - 1 };
    } else { cur.high = Math.max(cur.high, k.bid); cur.low = Math.min(cur.low, k.bid); cur.close = k.bid; cur.volume++; }
  }
  if (cur) out.push(cur);
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayUrl = (base: string, sym: string, d: Date, file: string) => `${base}/${sym}/${d.getUTCFullYear()}/${pad(d.getUTCMonth())}/${pad(d.getUTCDate())}/${file}`;

/** null = no data (404 or empty body). Throws on real network failures after retries. */
async function fetchBi5(url: string): Promise<Uint8Array | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const b = new Uint8Array(await res.arrayBuffer());
      return b.length === 0 ? null : b;
    } catch (e) { lastErr = e; await sleep(800 * (attempt + 1) ** 2); }
  }
  throw new Error(`ดาวน์โหลดไม่สำเร็จ ${url}: ${(lastErr as Error)?.message}`);
}

async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

type Mode = 'candles' | 'ticks';

async function fetchDayBars(mode: Mode, base: string, sym: string, day: Date, barMs: number, concurrency: number): Promise<Candle[]> {
  const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  if (mode === 'candles') {
    const buf = await fetchBi5(dayUrl(base, sym, day, 'BID_candles_min_1.bi5'));
    return buf ? aggregate(decodeCandleFile(buf, dayStart, sym), barMs) : [];
  }
  const hours = await pool(Array.from({ length: 24 }, (_, h) => h), concurrency, async (h) => {
    const buf = await fetchBi5(dayUrl(base, sym, day, `${pad(h)}h_ticks.bi5`));
    return buf ? decodeTickFile(buf, dayStart + h * 3_600_000, sym) : [];
  });
  return ticksToBars(hours.flat(), barMs);
}

/** Picks the working route by trying a recent weekday. Throws with a clear message if neither works. */
export async function probeMode(base: string, sym: string, barMs: number, now: number, log: (m: string) => void): Promise<Mode> {
  let d = new Date(now - 14 * DAY);
  while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() - DAY);
  try {
    const buf = await fetchBi5(dayUrl(base, sym, d, 'BID_candles_min_1.bi5'));
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (buf && decodeCandleFile(buf, day, sym).length >= 20) return 'candles'; // count 1-minute candles, not aggregated bars
    log('   ไฟล์แท่งเทียนรายวันไม่มีข้อมูล ลองแบบ tick');
  } catch (e) { log(`   แบบแท่งเทียนใช้ไม่ได้ (${(e as Error).message}) ลองแบบ tick`); }
  const hour = await fetchBi5(dayUrl(base, sym, d, '12h_ticks.bi5'));
  if (hour && decodeTickFile(hour, 0, sym).length >= 20) return 'ticks';
  throw new Error(`Dukascopy: ไม่พบข้อมูลของ ${sym} ที่ ${d.toISOString().slice(0, 10)} ทั้งสองรูปแบบ — เครือข่ายอาจถูกบล็อก หรือ Dukascopy เปลี่ยนรูปแบบไฟล์`);
}

export async function downloadForex(symbol: string, fromMs: number, o: DukaOptions & { dataDir: string; interval: string }): Promise<{ added: number; mode: Mode; file: string }> {
  const log = o.log ?? (() => {});
  const now = (o.now ?? Date.now)();
  const base = o.baseUrl ?? BASE;
  const barMs = intervalMs(o.interval);
  const conc = o.concurrency ?? 3;
  const file = cachePath(o.dataDir, 'forex', symbol, o.interval);
  const mode = await probeMode(base, symbol, barMs, now, log);
  log(`   ${symbol}: ใช้ไฟล์แบบ ${mode === 'candles' ? 'แท่งเทียนรายวัน (เร็ว)' : 'tick รายชั่วโมง (ช้า)'}`);
  const tail = lastOpenTime(file);
  let day = new Date(Math.floor((tail !== null ? tail + DAY : fromMs) / DAY) * DAY);
  const end = Math.floor(now / DAY) * DAY; // today (UTC) is incomplete, so stop before it
  let added = 0, processed = 0;
  while (day.getTime() < end) {
    const chunk: Date[] = [];
    for (let k = 0; k < conc * 4 && day.getTime() < end; k++) {
      if (day.getUTCDay() !== 6) chunk.push(new Date(day.getTime())); // Saturdays never have data
      day = new Date(day.getTime() + DAY);
    }
    const results = await pool(chunk, mode === 'candles' ? conc : 1, (d) => fetchDayBars(mode, base, symbol, d, barMs, conc));
    for (const bars of results) { appendBars(file, bars); added += bars.length; }
    processed += chunk.length;
    if (processed % 60 < chunk.length) log(`   ${symbol}: ถึง ${new Date(day.getTime() - DAY).toISOString().slice(0, 10)} (+${added.toLocaleString()} แท่ง)`);
  }
  return { added, mode, file };
}
