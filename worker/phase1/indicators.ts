import type { Candle, Side } from './types.ts';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** EMA seeded with the SMA of the first `period` values. Entries before the seed are NaN. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

const toRsi = (avgGain: number, avgLoss: number) =>
  avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

/** Wilder RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  let ag = gain / period, al = loss / period;
  out[period] = toRsi(ag, al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi(ag, al);
  }
  return out;
}

/** MACD(12,26,9) histogram. */
export function macdHistogram(closes: number[]): number[] {
  const fast = ema(closes, 12), slow = ema(closes, 26);
  const line = closes.map((_, i) => (Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : NaN));
  const first = line.findIndex((x) => Number.isFinite(x));
  const hist = new Array<number>(closes.length).fill(NaN);
  if (first < 0) return hist;
  const sig = ema(line.slice(first), 9);
  for (let j = 0; j < sig.length; j++) if (Number.isFinite(sig[j])) hist[first + j] = line[first + j] - sig[j];
  return hist;
}

/** Wilder ATR. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) =>
    i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface Indicators {
  emaFast: number[];
  emaSlow: number[];
  rsi: number[];
  hist: number[];
  atr: number[];
}

export function computeIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);
  return { emaFast: ema(closes, 20), emaSlow: ema(closes, 50), rsi: rsi(closes), hist: macdHistogram(closes), atr: atr(candles) };
}

export interface SideScore { score: number; reasons: string[] }

/** Score 0..1 for taking `side` at candle index i (max raw score is 0.9, then normalised). */
export function scoreSide(candles: Candle[], ind: Indicators, i: number, side: Side): SideScore {
  const buy = side === 'BUY';
  const close = candles[i].close;
  const ef = ind.emaFast[i], es = ind.emaSlow[i], h = ind.hist[i], hp = ind.hist[i - 1], r = ind.rsi[i];
  let s = 0;
  const reasons: string[] = [];
  // Trend points only count when the EMAs are clearly apart (>= 0.5 ATR); otherwise it's a sideways market.
  const trending = Math.abs(ef - es) >= 0.5 * ind.atr[i];
  if (trending && (buy ? ef > es : ef < es)) { s += 0.3; reasons.push(buy ? 'EMA20>EMA50' : 'EMA20<EMA50'); }
  if (trending && (buy ? close > es : close < es)) { s += 0.1; reasons.push(buy ? 'price>EMA50' : 'price<EMA50'); }
  if (buy ? h > 0 : h < 0) { s += 0.2; reasons.push(buy ? 'MACD hist>0' : 'MACD hist<0'); }
  if (buy ? h > hp : h < hp) { s += 0.1; reasons.push(buy ? 'MACD hist rising' : 'MACD hist falling'); }
  const [lo, hi] = buy ? [45, 68] : [32, 55];
  if (r >= lo && r <= hi) { s += 0.2; reasons.push(`RSI ${r.toFixed(0)} in zone`); }
  else if (buy ? r > hi && r <= 75 : r < lo && r >= 25) s += 0.05;
  else if (buy ? r > 75 : r < 25) { s -= 0.15; reasons.push(buy ? 'RSI overbought' : 'RSI oversold'); }
  return { score: clamp(s / 0.9, 0, 1), reasons };
}

const valid = (ind: Indicators, i: number) =>
  [ind.emaFast[i], ind.emaSlow[i], ind.rsi[i], ind.hist[i], ind.hist[i - 1], ind.atr[i]].every(Number.isFinite);

export interface TechSignal {
  side: Side;
  score: number;
  reasons: string[];
  price: number;
  atr: number;
  rsi: number;
  macdHist: number;
  emaFast: number;
  emaSlow: number;
}

/**
 * Returns a signal only if the same side scores >= minScore on each of the last `confirm`
 * CLOSED candles (the candle still forming is ignored).
 */
export function confirmedSignal(allCandles: Candle[], opts: { confirm: number; minScore: number; now?: number }): TechSignal | null {
  const now = opts.now ?? Date.now();
  const candles = allCandles.filter((c) => c.closeTime <= now);
  if (candles.length < 60) return null;
  const ind = computeIndicators(candles);
  const n = candles.length;
  let side: Side | null = null;
  let latest: SideScore | null = null;
  for (let k = 0; k < opts.confirm; k++) {
    const i = n - 1 - k;
    if (!valid(ind, i)) return null;
    const b = scoreSide(candles, ind, i, 'BUY'), s = scoreSide(candles, ind, i, 'SELL');
    const cur: Side = b.score >= s.score ? 'BUY' : 'SELL';
    const sc = cur === 'BUY' ? b : s;
    if (sc.score < opts.minScore) return null;
    if (side && side !== cur) return null;
    side = cur;
    if (k === 0) latest = sc;
  }
  const i = n - 1;
  return {
    side: side!, score: latest!.score, reasons: latest!.reasons, price: candles[i].close, atr: ind.atr[i], rsi: ind.rsi[i],
    macdHist: ind.hist[i], emaFast: ind.emaFast[i], emaSlow: ind.emaSlow[i],
  };
}
