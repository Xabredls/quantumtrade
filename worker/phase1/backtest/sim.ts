/**
 * Portfolio backtest that applies the SAME rules as the live scanner (shared ./paper.ts + indicators.ts):
 *  - signal = same side on the last N CLOSED candles, computed on a 100-candle window (exactly what live sees)
 *  - decision at the close of bar i, entry at the OPEN of bar i+1 (no look-ahead), slippage against us
 *  - stop first when a bar touches both, gap fills, fees, max-hold timeout
 *  - caps: per bot / per side / per symbol, cooldown, spot long-only, circuit-breaker pause
 * NOT simulated: the AI filter (cannot be backtested honestly), funding fees, liquidation, partial fills.
 */
import { confirmedSignal } from '../indicators.ts';
import { breakerState, entryFill, exitCheck, gate, pnlUsd, stopTarget, timeoutFill } from '../paper.ts';
import type { BotId, Candle, Side } from '../types.ts';

export interface SimConfig {
  bot: BotId;
  barMs: number;
  confirmCandles: number;
  minTechScore: number;
  slAtrMult: number;
  tpAtrMult: number;
  maxHoldHours: number;
  sizeUsd: number;
  feePct: number;
  slipPct: number;
  maxOpenPerBot: number;
  maxOpenPerSide: number;
  maxOrdersPerSymbol: number;
  entryCooldownMin: number;
  breakerLosses: number;
  breakerPauseMin: number;
  window?: number;
}

export interface Trade {
  symbol: string; side: Side; decidedAt: number; entryTime: number; entry: number; exitTime: number; exit: number;
  outcome: 'tp' | 'sl' | 'timeout'; pnlUsd: number; r: number; sizeUsd: number; barsHeld: number; techScore: number;
}

export interface SimResult {
  trades: Trade[];
  signals: number;
  skipped: Record<string, number>;
  unfinished: number;
  barsProcessed: number;
}

interface Pos {
  id: number; symbol: string; side: Side; techScore: number; atr: number; decidedAt: number; entryBarOpen: number;
  status: 'pending' | 'open'; entryTime: number; entry: number; sl: number; tp: number;
}

export function simulate(data: Map<string, Candle[]>, cfg: SimConfig, progress?: (pct: number) => void): SimResult {
  const window = cfg.window ?? 100;
  const symbols = [...data.keys()]; // order = priority when scores tie (callers pass most liquid first)
  const bars = symbols.map((s) => data.get(s)!);
  const ptr = new Array<number>(symbols.length).fill(0);
  let tMin = Infinity, tMax = -Infinity;
  for (const b of bars) if (b.length) { tMin = Math.min(tMin, b[0].openTime); tMax = Math.max(tMax, b[b.length - 1].openTime); }
  const result: SimResult = { trades: [], signals: 0, skipped: {}, unfinished: 0, barsProcessed: 0 };
  if (!Number.isFinite(tMin)) return result;
  const skip = (r: string) => { result.skipped[r] = (result.skipped[r] ?? 0) + 1; };

  const positions: Pos[] = [];
  const closedLog: Array<{ closedAt: number; pnl: number }> = [];
  let nextId = 1;
  const maxHoldMs = cfg.maxHoldHours * 3_600_000;
  const cooldownMs = cfg.entryCooldownMin * 60_000;
  const limits = { maxOpenPerBot: cfg.maxOpenPerBot, maxOpenPerSide: cfg.maxOpenPerSide, maxOrdersPerSymbol: cfg.maxOrdersPerSymbol, cooldownMs };
  const totalSteps = Math.max(1, Math.round((tMax - tMin) / cfg.barMs));
  let step = 0;

  for (let T = tMin; T <= tMax; T += cfg.barMs, step++) {
    if (progress && step % 20000 === 0) progress(step / totalSteps);
    // the bar of each symbol that opens at T (skipping any stale ones if the data is not on the grid)
    const cur: Array<Candle | null> = new Array(symbols.length).fill(null);
    const idx: number[] = new Array(symbols.length).fill(-1);
    for (let s = 0; s < symbols.length; s++) {
      const b = bars[s];
      while (ptr[s] < b.length && b[ptr[s]].openTime < T) ptr[s]++;
      if (ptr[s] < b.length && b[ptr[s]].openTime === T) { cur[s] = b[ptr[s]]; idx[s] = ptr[s]; result.barsProcessed++; }
    }
    const barOf = (sym: string) => cur[symbols.indexOf(sym)];

    // A. fill entries scheduled for the open of this bar; cancel the ones whose bar never came (gap)
    for (const p of positions) {
      if (p.status !== 'pending') continue;
      if (p.entryBarOpen > T) continue;
      const bar = p.entryBarOpen === T ? barOf(p.symbol) : null;
      if (!bar) { p.status = 'open'; p.entry = NaN; skip('entry_bar_missing'); continue; }
      p.entry = entryFill(p.side, bar.open, cfg.slipPct);
      const st = stopTarget(p.side, p.entry, p.atr, cfg.slAtrMult, cfg.tpAtrMult);
      if (!(st.sl > 0 && st.tp > 0)) { p.entry = NaN; skip('bad_levels'); p.status = 'open'; continue; }
      p.sl = st.sl; p.tp = st.tp; p.entryTime = T; p.status = 'open';
    }
    // drop the ones that could not be filled
    for (let k = positions.length - 1; k >= 0; k--) if (positions[k].status === 'open' && Number.isNaN(positions[k].entry)) positions.splice(k, 1);

    // B. exits
    for (let k = positions.length - 1; k >= 0; k--) {
      const p = positions[k];
      if (p.status !== 'open') continue;
      const bar = barOf(p.symbol);
      if (!bar) continue;
      let exit: { price: number; outcome: Trade['outcome'] } | null = exitCheck(p, bar, cfg.slipPct);
      if (!exit && bar.closeTime - p.entryTime >= maxHoldMs) exit = { price: timeoutFill(p.side, bar.close, cfg.slipPct), outcome: 'timeout' };
      if (!exit) continue;
      const pnl = pnlUsd(p.side, p.entry, exit.price, cfg.sizeUsd, cfg.feePct);
      const risk = cfg.sizeUsd * Math.abs(p.entry - p.sl) / p.entry;
      result.trades.push({
        symbol: p.symbol, side: p.side, decidedAt: p.decidedAt, entryTime: p.entryTime, entry: p.entry, exitTime: bar.closeTime, exit: exit.price,
        outcome: exit.outcome, pnlUsd: pnl, r: risk > 0 ? pnl / risk : 0, sizeUsd: cfg.sizeUsd, barsHeld: Math.round((bar.closeTime + 1 - p.entryTime) / cfg.barMs), techScore: p.techScore,
      });
      closedLog.push({ closedAt: bar.closeTime, pnl });
      positions.splice(k, 1);
    }

    // C. signals on the bars that just closed
    const cands: Array<{ s: number; side: Side; score: number; atr: number }> = [];
    for (let s = 0; s < symbols.length; s++) {
      const bar = cur[s];
      if (!bar || idx[s] < window - 1) continue;
      const win = bars[s].slice(idx[s] - window + 1, idx[s] + 1);
      const sig = confirmedSignal(win, { confirm: cfg.confirmCandles, minScore: cfg.minTechScore, now: bar.closeTime });
      if (!sig) continue;
      result.signals++;
      if (cfg.bot === 'spot' && sig.side === 'SELL') { skip('spot_long_only'); continue; }
      cands.push({ s, side: sig.side, score: sig.score, atr: sig.atr });
    }
    cands.sort((a, b) => b.score - a.score || a.s - b.s);
    for (const c of cands) {
      const sym = symbols[c.s];
      const now = bars[c.s][idx[c.s]].closeTime;
      const br = breakerState(closedLog.slice(-cfg.breakerLosses).reverse(), now, cfg.breakerLosses, cfg.breakerPauseMin * 60_000);
      const reason = gate({
        bot: cfg.bot, side: c.side, symbol: sym, now,
        openForBot: positions.length, openForSide: positions.filter((p) => p.side === c.side).length,
        openOnSymbol: positions.filter((p) => p.symbol === sym).map((p) => ({ side: p.side, openedAt: p.decidedAt })),
        breakerActive: br.active, limits,
      });
      if (reason) { skip(reason); continue; }
      positions.push({ id: nextId++, symbol: sym, side: c.side, techScore: c.score, atr: c.atr, decidedAt: now, entryBarOpen: T + cfg.barMs, status: 'pending', entryTime: 0, entry: 0, sl: 0, tp: 0 });
    }
  }
  result.unfinished = positions.length;
  progress?.(1);
  return result;
}
