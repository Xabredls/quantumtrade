# Real-data backtest

Run from the repo root (see worker/phase1/backtest/run.ts for all options):

    npx tsx worker/phase1/backtest/run.ts download --market spot    --top 20
    npx tsx worker/phase1/backtest/run.ts download --market futures --top 20
    npx tsx worker/phase1/backtest/run.ts download --market forex                # EURUSD, GBPUSD, XAUUSD (gold)
    npx tsx worker/phase1/backtest/run.ts status
    npx tsx worker/phase1/backtest/run.ts run --market futures [--from 2021-01-01] [--to 2025-12-31] [--size 20]

Data: Binance REST klines (spot/futures, back to listing) and Dukascopy (forex/gold, BID prices, UTC). Downloads are resumable.
Stored as binary files under <data dir>/history, results under <data dir>/backtests (JSON + trades CSV).
The data dir is the folder of PHASE1_DB (or QT_DATA_DIR).

What is simulated: the SAME rules as the live scanner (shared paper.ts + indicators.ts): signal on the last N closed candles,
decision at bar close, entry at the NEXT bar open, fees, slippage, stop-first, gap fills, max hold, caps, circuit breaker.
Not simulated: the Gemini filter, funding fees, liquidation. The report also compares against random entry timing and
gives a day-block bootstrap interval, so luck is not mistaken for edge.
