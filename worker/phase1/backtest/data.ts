import fs from 'node:fs';
import path from 'node:path';
import type { Candle } from '../types.ts';

export type Market = 'futures' | 'spot' | 'forex';

const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
export function intervalMs(interval: string): number {
  const m = /^(\d+)([mhd])$/.exec(interval);
  if (!m) throw new Error(`interval ไม่ถูกต้อง: ${interval}`);
  return Number(m[1]) * UNITS[m[2]];
}

/** Where the candles of one symbol are cached (Float64 rows: openTime, open, high, low, close, volume). */
export function cachePath(dataDir: string, market: Market, symbol: string, interval: string): string {
  return path.join(dataDir, 'history', market, `${symbol}_${interval}.bin`);
}

const ROW = 6 * 8;

export function readBars(file: string, barMs: number): Candle[] {
  if (!fs.existsSync(file)) return [];
  const buf = fs.readFileSync(file);
  const n = Math.floor(buf.length / ROW);
  const f = new Float64Array(buf.buffer, buf.byteOffset, n * 6);
  const out: Candle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    out[i] = { openTime: f[o], open: f[o + 1], high: f[o + 2], low: f[o + 3], close: f[o + 4], volume: f[o + 5], closeTime: f[o] + barMs - 1 };
  }
  return out;
}

export function appendBars(file: string, bars: Candle[]): void {
  if (bars.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const f = new Float64Array(bars.length * 6);
  bars.forEach((b, i) => { f.set([b.openTime, b.open, b.high, b.low, b.close, b.volume], i * 6); });
  fs.appendFileSync(file, Buffer.from(f.buffer));
}

export function lastOpenTime(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  const size = fs.statSync(file).size;
  const n = Math.floor(size / ROW);
  if (n === 0) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(8);
    fs.readSync(fd, b, 0, 8, (n - 1) * ROW);
    return b.readDoubleLE(0);
  } finally { fs.closeSync(fd); }
}

/** Build coarser bars from finer ones (e.g. 1m -> 15m). Buckets are aligned to UTC. */
export function aggregate(fine: Candle[], targetMs: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of fine) {
    const bucket = Math.floor(c.openTime / targetMs) * targetMs;
    if (!cur || cur.openTime !== bucket) {
      if (cur) out.push(cur);
      cur = { openTime: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, closeTime: bucket + targetMs - 1 };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface DataQuality {
  bars: number; first: number | null; last: number | null; removed: number; gaps: number; largestGapHours: number; badRows: number;
}

/** Drops broken rows (non-finite, high<low, non-positive, out of order) and measures gaps. */
export function cleanBars(bars: Candle[], barMs: number): { bars: Candle[]; quality: DataQuality } {
  const good: Candle[] = [];
  let bad = 0, gaps = 0, largest = 0;
  for (const b of bars) {
    const ok = [b.open, b.high, b.low, b.close].every((x) => Number.isFinite(x) && x > 0) && b.high >= b.low &&
      b.high >= Math.max(b.open, b.close) - 1e-12 && b.low <= Math.min(b.open, b.close) + 1e-12;
    const prev = good[good.length - 1];
    if (!ok || (prev && b.openTime <= prev.openTime)) { bad++; continue; }
    if (prev && b.openTime - prev.openTime > barMs * 1.5) {
      gaps++;
      largest = Math.max(largest, (b.openTime - prev.openTime) / 3_600_000);
    }
    good.push(b);
  }
  return { bars: good, quality: { bars: good.length, first: good[0]?.openTime ?? null, last: good[good.length - 1]?.openTime ?? null, removed: bad, gaps, largestGapHours: Math.round(largest * 10) / 10, badRows: bad } };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function resolveDataDir(env: NodeJS.ProcessEnv, fallback: string): string {
  if (env.QT_DATA_DIR) return env.QT_DATA_DIR;
  if (env.PHASE1_DB) return path.dirname(env.PHASE1_DB);
  return fallback;
}

export interface FileInfo { symbol: string; interval: string; bars: number; first: number | null; last: number | null }

/** What history is cached on disk (reads only the first and last row of each file). */
export function datasetStatus(dataDir: string): Record<Market, FileInfo[]> {
  const out: Record<Market, FileInfo[]> = { futures: [], spot: [], forex: [] };
  for (const m of ['futures', 'spot', 'forex'] as const) {
    const dir = path.join(dataDir, 'history', m);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.bin')).sort()) {
      const [symbol, interval] = f.replace('.bin', '').split('_');
      const file = path.join(dir, f);
      const rows = Math.floor(fs.statSync(file).size / ROW);
      let first: number | null = null;
      if (rows > 0) { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0); first = b.readDoubleLE(0); } finally { fs.closeSync(fd); } }
      out[m].push({ symbol, interval, bars: rows, first, last: lastOpenTime(file) });
    }
  }
  return out;
}
