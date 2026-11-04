/**
 * "Does the signal timing add anything?" test. Takes the REAL trades' symbols and sides, but moves each entry to a
 * RANDOM bar of the same symbol, and applies the identical stop/target/fees/slippage rules. Repeats many times. If the
 * real strategy's average R is not clearly above this random-timing distribution, the entry rules have no demonstrated edge.
 * (Portfolio caps are not applied to the random trades; compare per-trade expectancy, not totals.)
 */
import { atr } from '../indicators.ts';
import { entryFill, exitCheck, pnlUsd, stopTarget, timeoutFill } from '../paper.ts';
import type { Candle } from '../types.ts';
import type { SimConfig, Trade } from './sim.ts';
import { mulberry32 } from './stats.ts';

export interface BenchmarkResult {
  iterations: number; tradesPerIteration: number; actualMeanR: number | null;
  random: { mean: number; sd: number; p5: number; p50: number; p95: number } | null;
  /** share of random runs that did at least as well as the real strategy (small = real result unlikely to be luck of timing) */
  pValue: number | null;
}

export function randomEntryBenchmark(data: Map<string, Candle[]>, trades: Trade[], cfg: SimConfig, iterations = 200, seed = 7, maxTrades = 3000): BenchmarkResult {
  const window = cfg.window ?? 100;
  const usable = trades.filter((t) => (data.get(t.symbol)?.length ?? 0) > window + 10);
  if (usable.length < 20) return { iterations: 0, tradesPerIteration: usable.length, actualMeanR: null, random: null, pValue: null };
  const actualMeanR = usable.reduce((a, t) => a + t.r, 0) / usable.length; // uses ALL real trades
  // Each random run re-times at most `maxTrades` of them (a fixed, seeded sample keeps the symbol/side mix) so huge
  // trade counts stay fast. Fewer trades per run makes the random distribution WIDER, i.e. the p-value more conservative.
  const pick = mulberry32(seed + 1);
  const sample = usable.length <= maxTrades ? usable : [...usable].map((t) => [pick(), t] as const).sort((a, b) => a[0] - b[0]).slice(0, maxTrades).map((x) => x[1]);
  const maxHoldBars = Math.ceil((cfg.maxHoldHours * 3_600_000) / cfg.barMs);
  const rnd = mulberry32(seed);
  const means: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let sumR = 0, n = 0;
    for (const t of sample) {
      const bars = data.get(t.symbol)!;
      const i = window - 1 + Math.floor(rnd() * (bars.length - window - 2)); // signal bar; entry bar is i+1
      const a = atr(bars.slice(i - window + 1, i + 1))[window - 1];
      if (!(a > 0)) continue;
      const entry = entryFill(t.side, bars[i + 1].open, cfg.slipPct);
      const { sl, tp } = stopTarget(t.side, entry, a, cfg.slAtrMult, cfg.tpAtrMult);
      if (!(sl > 0 && tp > 0)) continue;
      let exit: number | null = null;
      for (let j = i + 1; j < bars.length && j <= i + 1 + maxHoldBars; j++) {
        const hit = exitCheck({ side: t.side, sl, tp }, bars[j], cfg.slipPct);
        if (hit) { exit = hit.price; break; }
        if (j === i + 1 + maxHoldBars || bars[j].closeTime - bars[i + 1].openTime >= cfg.maxHoldHours * 3_600_000) { exit = timeoutFill(t.side, bars[j].close, cfg.slipPct); break; }
      }
      if (exit === null) continue; // ran off the end of the data
      const risk = cfg.sizeUsd * Math.abs(entry - sl) / entry;
      sumR += pnlUsd(t.side, entry, exit, cfg.sizeUsd, cfg.feePct) / risk; n++;
    }
    if (n > 0) means.push(sumR / n);
  }
  if (means.length === 0) return { iterations: 0, tradesPerIteration: usable.length, actualMeanR, random: null, pValue: null };
  const sorted = [...means].sort((a, b) => a - b);
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  const sd = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / means.length);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const atLeast = means.filter((m) => m >= actualMeanR).length;
  return { iterations: means.length, tradesPerIteration: sample.length, actualMeanR, random: { mean, sd, p5: q(0.05), p50: q(0.5), p95: q(0.95) }, pValue: (atLeast + 1) / (means.length + 1) };
}
