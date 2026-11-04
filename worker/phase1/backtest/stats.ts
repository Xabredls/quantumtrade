import type { Trade } from './sim.ts';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Summary {
  trades: number; wins: number; losses: number; winRate: number | null;
  avgWinUsd: number | null; avgLossUsd: number | null; profitFactor: number | null;
  expectancyUsd: number | null; expectancyR: number | null; totalPnlUsd: number;
  maxDrawdownUsd: number; longestLossStreak: number; avgHoldHours: number | null;
  outcomes: { tp: number; sl: number; timeout: number };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function summarize(trades: Trade[], barMs: number): Summary {
  const n = trades.length;
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const wins = trades.filter((t) => t.pnlUsd > 0), losses = trades.filter((t) => t.pnlUsd <= 0);
  const grossWin = sum(wins.map((t) => t.pnlUsd)), grossLoss = -sum(losses.map((t) => t.pnlUsd));
  let cum = 0, peak = 0, dd = 0, streak = 0, longest = 0;
  for (const t of sorted) {
    cum += t.pnlUsd; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum);
    if (t.pnlUsd <= 0) { streak++; longest = Math.max(longest, streak); } else streak = 0;
  }
  return {
    trades: n, wins: wins.length, losses: losses.length, winRate: n ? wins.length / n : null,
    avgWinUsd: wins.length ? grossWin / wins.length : null, avgLossUsd: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancyUsd: n ? sum(trades.map((t) => t.pnlUsd)) / n : null, expectancyR: n ? sum(trades.map((t) => t.r)) / n : null,
    totalPnlUsd: sum(trades.map((t) => t.pnlUsd)), maxDrawdownUsd: dd, longestLossStreak: longest,
    avgHoldHours: n ? sum(trades.map((t) => t.barsHeld * barMs)) / n / 3_600_000 : null,
    outcomes: { tp: trades.filter((t) => t.outcome === 'tp').length, sl: trades.filter((t) => t.outcome === 'sl').length, timeout: trades.filter((t) => t.outcome === 'timeout').length },
  };
}

export interface Slice { n: number; winRate: number | null; pnlUsd: number; expectancyR: number | null }
export function breakdown(trades: Trade[], key: (t: Trade) => string): Record<string, Slice> {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) { const k = key(t); groups.set(k, [...(groups.get(k) ?? []), t]); }
  const out: Record<string, Slice> = {};
  for (const [k, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[k] = { n: g.length, winRate: g.filter((t) => t.pnlUsd > 0).length / g.length, pnlUsd: sum(g.map((t) => t.pnlUsd)), expectancyR: sum(g.map((t) => t.r)) / g.length };
  }
  return out;
}

export const yearOf = (ms: number) => String(new Date(ms).getUTCFullYear());
export const quarterOf = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };

/** Cumulative PnL by exit time, thinned to at most `points` samples for charting. */
export function equityCurve(trades: Trade[], points = 300): Array<{ t: number; pnl: number }> {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  let cum = 0;
  const full = sorted.map((t) => ({ t: t.exitTime, pnl: (cum += t.pnlUsd) }));
  if (full.length <= points) return full;
  const step = full.length / points;
  const out = Array.from({ length: points }, (_, i) => full[Math.min(full.length - 1, Math.floor(i * step))]);
  out[out.length - 1] = full[full.length - 1];
  return out;
}

export interface Interval { mean: number | null; lo: number | null; hi: number | null; iterations: number }

/**
 * 95% bootstrap interval for the mean R per trade. Trades are resampled by calendar DAY (blocks), because trades
 * opened on the same day are strongly correlated (the whole market moves together); resampling single trades would
 * make the interval far too narrow.
 */
export function bootstrapMeanR(trades: Trade[], iterations = 2000, seed = 1): Interval {
  if (trades.length < 2) return { mean: null, lo: null, hi: null, iterations: 0 };
  const byDay = new Map<number, number[]>();
  for (const t of trades) { const d = Math.floor(t.entryTime / 86_400_000); byDay.set(d, [...(byDay.get(d) ?? []), t.r]); }
  const days = [...byDay.values()];
  const rnd = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let s = 0, n = 0;
    for (let k = 0; k < days.length; k++) { const g = days[Math.floor(rnd() * days.length)]; for (const r of g) s += r; n += g.length; }
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const q = (p: number) => means[Math.min(means.length - 1, Math.floor(p * means.length))];
  return { mean: sum(trades.map((t) => t.r)) / trades.length, lo: q(0.025), hi: q(0.975), iterations };
}
