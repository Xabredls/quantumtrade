# Audit of the Phase 1 bot (v2 -> v3)

Fixed in v3 (each has a test):
1. Entry used the last CLOSED candle's close (up to 15 min stale) -> now the live price.
2. Open positions were resolved with 15m candles and the entry candle was skipped entirely (a stop hit right after
   entry could be missed = optimistic) -> 1m candles (5m after 15h), only the entry minute is skipped.
3. Exits had no slippage and filled exactly at the stop even on gaps -> shared rules: stop-first, gap fills at the open,
   slippage on market exits only.
4. Spot SELL candidates were sent to the AI and used its quota -> filtered before the AI call.
5. AI quota ties (scores cap out at the same value) were broken arbitrarily -> most liquid symbol first, deterministic.
6. Circuit breaker was derived from history and released itself the moment a pending trade won -> timed pause
   (BREAKER_PAUSE_MIN, default 120) with the same code in the backtest.
7. 20 open futures positions could all be the same side (one market-wide bet) -> MAX_OPEN_PER_SIDE (default 12).
8. Gemini prompt had the stop/target numbers hard-coded; output budget not set; long error bodies in the log.

Open / recommended (not changed):
- Costs: fees+slippage are roughly 0.2-0.3 R per trade at a 1.5 ATR stop. The signal must beat that to break even.
- The signal fires in sideways markets too; on synthetic choppy data it did worse than random timing. Test a
  trend-strength filter with the backtest before adopting it.
- Gemini confidence clusters around 0.5 (not calibrated), so "confidence >= 0.5" is close to a coin flip and sizing by
  confidence is meaningless. Measure the AI with shadow positions (track the signals it skipped) before trusting it.
- The live Forex bot still uses SYNTHETIC data; only the backtest uses real forex/gold history.
- Futures paper PnL has no funding fees (<= 3 charges per 24h hold).

## Update (v4)
- Shadow tracking (SHADOW_TRACKING, default on; SHADOW_SIZE_USD default 15): signals the AI REJECTED (ai_skip, low_confidence,
  ai_disagrees) are still followed as SHADOW positions with identical rules. They have their own caps, never count in real stats and
  never trip the breaker. Compare "R/trade AI approved" with "R/trade AI rejected" on the Phase 1 tab to see whether the AI helps.
  (Shadow data only starts from the moment you upgrade.)
