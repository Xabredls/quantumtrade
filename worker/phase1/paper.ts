/**
 * Paper-trading rules shared by the LIVE scanner and the BACKTEST, so both behave identically.
 * Pure functions only (no I/O).
 */
import type { Candle, Side } from './types.ts';

export function sizeForConfidence(conf: number, maxNotional: number): number {
  const usd = conf >= 0.9 ? 30 : conf >= 0.8 ? 25 : conf >= 0.7 ? 20 : 15;
  return Math.min(usd, maxNotional);
}

/** Round-trip fee model: `feePct` is charged on entry and exit notional. */
export function pnlUsd(side: Side, entry: number, exit: number, sizeUsd: number, feePct: number): number {
  const qty = sizeUsd / entry;
  const gross = (side === 'BUY' ? exit - entry : entry - exit) * qty;
  const fees = (sizeUsd + qty * exit) * (feePct / 100);
  return gross - fees;
}

/** Market entry: slippage always works against us. */
export function entryFill(side: Side, price: number, slipPct: number): number {
  return side === 'BUY' ? price * (1 + slipPct / 100) : price * (1 - slipPct / 100);
}

export function stopTarget(side: Side, entry: number, atr: number, slMult: number, tpMult: number) {
  return side === 'BUY'
    ? { sl: entry - slMult * atr, tp: entry + tpMult * atr }
    : { sl: entry + slMult * atr, tp: entry - tpMult * atr };
}

export interface ExitHit { price: number; outcome: 'tp' | 'sl' }

/**
 * Does this candle stop us out / hit the target?
 * - Stop is checked first (when one candle touches both we cannot know the order, so assume the worst).
 * - Stops are market orders: if the candle OPENS beyond the stop we fill at the open (gap), then add slippage.
 * - Targets are limit orders: no slippage; if the candle opens beyond the target we get the better open price.
 */
export function exitCheck(p: { side: Side; sl: number; tp: number }, c: Candle, slipPct: number): ExitHit | null {
  if (p.side === 'BUY') {
    if (c.low <= p.sl) return { price: Math.min(p.sl, c.open) * (1 - slipPct / 100), outcome: 'sl' };
    if (c.high >= p.tp) return { price: Math.max(p.tp, c.open), outcome: 'tp' };
  } else {
    if (c.high >= p.sl) return { price: Math.max(p.sl, c.open) * (1 + slipPct / 100), outcome: 'sl' };
    if (c.low <= p.tp) return { price: Math.min(p.tp, c.open), outcome: 'tp' };
  }
  return null;
}

/** Closing at market because the maximum holding time ran out. */
export function timeoutFill(side: Side, price: number, slipPct: number): number {
  return side === 'BUY' ? price * (1 - slipPct / 100) : price * (1 + slipPct / 100);
}

export interface ClosedTradeLite { closedAt: number; pnl: number }

/**
 * Circuit breaker. Looks at the newest `losses` closed trades (after `resetAt`): if they are ALL losers, new entries
 * are paused until `pauseMs` after the latest loss closed. After the pause, trading resumes by itself (so a paper
 * experiment keeps collecting data); the next streak of `losses` trips it again. `closedNewestFirst` must be sorted.
 */
export function breakerState(closedNewestFirst: ClosedTradeLite[], now: number, losses: number, pauseMs: number, resetAt = 0): { active: boolean; until: number | null } {
  const recent = closedNewestFirst.filter((t) => t.closedAt > resetAt).slice(0, losses);
  if (recent.length < losses || recent.some((t) => t.pnl > 0)) return { active: false, until: null };
  const until = recent[0].closedAt + pauseMs;
  return { active: now < until, until };
}

export interface GateInput {
  bot: 'futures' | 'spot' | 'forex';
  side: Side;
  symbol: string;
  now: number;
  openForBot: number;
  openForSide: number;
  openOnSymbol: Array<{ side: Side; openedAt: number }>;
  breakerActive: boolean;
  limits: { maxOpenPerBot: number; maxOpenPerSide: number; maxOrdersPerSymbol: number; cooldownMs: number };
}

/** Returns why a new position is NOT allowed, or null if it is. Same order of checks live and in backtests. */
export function gate(g: GateInput): string | null {
  if (g.bot === 'spot' && g.side === 'SELL') return 'spot_long_only';
  if (g.breakerActive) return 'circuit_breaker';
  if (g.openForBot >= g.limits.maxOpenPerBot) return 'max_open_bot';
  if (g.openForSide >= g.limits.maxOpenPerSide) return 'max_open_side';
  if (g.openOnSymbol.length >= g.limits.maxOrdersPerSymbol) return 'max_per_symbol';
  if (g.openOnSymbol.some((p) => p.side !== g.side)) return 'opposite_open';
  const last = g.openOnSymbol.reduce((m, p) => Math.max(m, p.openedAt), 0);
  if (last && g.now - last < g.limits.cooldownMs) return 'cooldown';
  return null;
}
