# Phase 1 — multi-bot scanner (paper trading only)

Run: set PHASE1_ENABLED=true in worker/.env, then from the repo root: npm run worker
Self-test (offline): npx tsx worker/phase1/selftest.ts

Flow per cycle (default every 5 min): resolve open paper positions -> scan (volume filter -> EMA20/50 + RSI + MACD,
same side on the last N closed candles) -> ONE batched Gemini call -> open paper positions (size by AI confidence).
No real or testnet orders are ever sent. Data: worker/phase1/data/learning.db (SQLite; tables cycles, signals, positions).

skip_reason values in the signals table: ai_unavailable, ai_cap, ai_no_verdict, ai_skip, ai_disagrees, low_confidence,
spot_long_only, circuit_breaker, bad_atr, max_open_bot, max_per_symbol, opposite_open, cooldown.

Paper-trade rules: SL = 1.5 x ATR, TP = 2.25 x ATR, max hold 24h. If a candle touches both, the stop is assumed first.
Fees: futures 0.05% / spot 0.10% per side. No slippage modelled. Forex data is SYNTHETIC.
Optional env vars (defaults): see worker/.env.example and worker/phase1/config.ts.
