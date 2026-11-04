# What the cleanup removed, and why

The old dashboard was an in-browser trading SIMULATOR: prices were a random walk, positions/news/"AI learning" results were
generated locally, and several controls looked real but were not. Removed files are kept in scripts/backup/removed-simulation/.

Controls that looked real but did nothing outside the browser:
- "ENGINE ACTIVE / บอทกำลังรัน 24/7" switch in the header (only paused the simulation).
- "Market Close All" emergency button (closed simulated positions only - NOT Binance).
- "Test proxy" (always succeeded), exchange/OANDA "connected, 36 ms" badges, "BULLISH 88%", the news calendar ("FOMC in 42 min").
- "AI self-learning" results (invented win rates and profits), pre-filled demo positions and demo API keys.
- Telegram alerts (they described simulated trades).

Kept (real): Phase 1 tab (real Binance data, paper trading), Backtest tab (real history), and a real connection test
(dashboard -> worker -> Binance, read-only).

Not replaced: there is no real kill switch for manual orders yet. Phase 1 sends no orders, so nothing needs closing today.
After the cleanup these npm packages are unused by the front-end: motion, qrcode (optional: npm uninstall motion qrcode).
The dashboard server still exposes /api/ai-analyze-trade; no screen calls it now.
