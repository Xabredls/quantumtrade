import { GeoBlockedError } from '../../binance.ts';
import { BinanceMarket, RateLimitError } from '../binance-market.ts';
import type { Venue } from '../binance-market.ts';
import { appendBars, cachePath, intervalMs, lastOpenTime, readBars, sleep } from './data.ts';
import type { Candle } from '../types.ts';

const BASE: Record<Venue, string> = { spot: 'https://api.binance.com', futures: 'https://fapi.binance.com' };
const PATH: Record<Venue, string> = { spot: '/api/v3/klines', futures: '/fapi/v1/klines' };
const PAGE: Record<Venue, number> = { spot: 1000, futures: 1500 };
const WEIGHT_LIMIT: Record<Venue, number> = { spot: 6000, futures: 2400 };
const WEIGHT_PER_CALL: Record<Venue, number> = { spot: 2, futures: 10 };

export interface DownloadOpts {
  venue: Venue;
  symbol: string;
  interval: string;
  /** earliest time wanted (ms). 0 = as far back as the exchange has. */
  from: number;
  dataDir: string;
  baseUrl?: string;
  log?: (m: string) => void;
  now?: () => number;
}

const parse = (k: any[]): Candle => ({
  openTime: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]),
  close: parseFloat(k[4]), volume: parseFloat(k[5]), closeTime: Number(k[6]),
});

/** Pages klines forward from the cached tail (or `from`) until the present. Resumable. Returns number of new bars. */
export async function downloadBinance(o: DownloadOpts): Promise<{ added: number; total: number; file: string }> {
  const log = o.log ?? (() => {});
  const now = o.now ?? Date.now;
  const barMs = intervalMs(o.interval);
  const file = cachePath(o.dataDir, o.venue, o.symbol, o.interval);
  const tail = lastOpenTime(file);
  let start = tail !== null ? tail + barMs : o.from;
  const base = o.baseUrl ?? BASE[o.venue];
  let added = 0, calls = 0;
  for (;;) {
    const url = `${base}${PATH[o.venue]}?symbol=${o.symbol}&interval=${o.interval}&startTime=${start}&limit=${PAGE[o.venue]}`;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { res = await fetch(url, { signal: AbortSignal.timeout(20_000) }); }
      catch (e) { if (attempt === 5) throw e; await sleep(1500 * (attempt + 1)); continue; }
      if (res.status === 429 || res.status === 418) {
        const wait = (Number(res.headers.get('retry-after')) || 60) * 1000;
        log(`   rate limited, รอ ${Math.round(wait / 1000)}s`);
        if (attempt === 5) throw new RateLimitError('Binance rate limit', wait / 1000);
        await sleep(wait); continue;
      }
      break;
    }
    if (!res) throw new Error('no response');
    const text = await res.text();
    if (res.status === 451 || /restricted location/i.test(text)) throw new GeoBlockedError('Binance ปฏิเสธเพราะตำแหน่งเครื่อง (HTTP 451)');
    if (res.status === 400 && /Invalid symbol/i.test(text)) throw new Error(`ไม่มีสัญลักษณ์ ${o.symbol} ใน ${o.venue}`);
    if (!res.ok) throw new Error(`Binance ${o.venue} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
    const rows = JSON.parse(text) as any[][];
    calls++;
    const bars = rows.map(parse).filter((b) => b.closeTime < now()); // never store the candle that is still forming
    appendBars(file, bars);
    added += bars.length;
    if (rows.length < PAGE[o.venue] || bars.length < rows.length || rows.length === 0) break;
    start = Number(rows[rows.length - 1][0]) + barMs;
    if (calls % 20 === 0) log(`   ${o.symbol}: ${added.toLocaleString()} แท่ง (ถึง ${new Date(start).toISOString().slice(0, 10)})`);
    // stay well under the weight limit (the exchange reports usage in a header)
    const used = Number(res.headers.get('x-mbx-used-weight-1m') ?? res.headers.get('x-mbx-used-weight') ?? 0);
    if (used > WEIGHT_LIMIT[o.venue] * 0.7 - WEIGHT_PER_CALL[o.venue]) { log('   ใกล้เพดาน weight พัก 30s'); await sleep(30_000); }
    else await sleep(o.baseUrl ? 0 : 120);
  }
  const total = readBars(file, barMs).length;
  return { added, total, file };
}

/** Top symbols by current 24h volume (note: today's winners — see the survivorship-bias warning in the report). */
export async function topSymbols(venue: Venue, n: number, baseUrl?: string): Promise<string[]> {
  const m = new BinanceMarket(venue, { dataSource: 'live', minQuoteVolume: 0, maxSymbols: n, baseUrl });
  return (await m.listSymbols()).symbols.map((s) => s.symbol);
}
