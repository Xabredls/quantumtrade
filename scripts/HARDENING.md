# Hardening of the original code (hardening-v2)

Fixed (each has a test; run: npx tsx worker/selftest-core.ts  and  npx tsx guard/selftest.ts):
Worker order path (worker/binance.ts, worker/index.ts)
1. The entry was sent first and the stop AFTER it. A stop rejected for a bad tick size meant "open, then immediately close" (fees burned).
   Quantity and stop are now rounded to the exchange's lot/tick sizes and validated BEFORE the entry.
2. If the stop failed AND the emergency close failed, the error was swallowed and the reply said the position was closed.
   The close is now verified with positionRisk; if it cannot be verified an UnprotectedPositionError (HTTP 500, unprotected:true,
   loud log) is raised instead.
3. A timeout on the entry was treated as "failed" although Binance may have filled it. The order is now looked up by client id.
4. A PC clock that drifts >5 s made every signed request fail (-1021). The clock offset is measured and re-synced on error.
5. /order had no lock, no duplicate protection and no audit trail: one order at a time, same symbol+side blocked for
   ORDER_COOLDOWN_SEC (default 30 s), every attempt written to orders-audit.jsonl (dry-run included).
6. Oversized bodies now close the connection; a busy port prints a clear message instead of a stack trace.
Dashboard server (server.ts, guard/ai-guard.ts)
7. /api/ai-analyze-trade: a request without stop-loss/take-profit was assumed to have risk:reward 2.0 and could be approved;
   with Gemini on, the hard rules (R:R >= 1.5, news blackout) existed only in the prompt. Now inputs are validated, hard rules are
   enforced in code (the AI can only make the decision stricter), model numbers are sanity-checked, confidence is clamped, free text
   cannot inject prompt instructions, fake "safety checks" (hard-coded liquidation buffer, hedging available) and the fabricated
   85% confidence are gone, and internal error text is not returned.
8. /api/exchange/order had no authentication; the UI never uses it. Now OFF unless ENABLE_ORDER_PROXY=true and ORDER_PROXY_KEY is set.
9. Unknown /api routes returned the web page; bad JSON returned a stack trace; the rate-limit map never forgot IPs.
UI (src/components/WorkstationView.tsx)
10. When the AI call failed, the page INVENTED an approval ("Gemini 3.8 Flash (Client Guard)", 91%). It now fails closed.

Added in v2
11. Worker: hedge-mode accounts are supported (positionSide on entry/stop, no reduceOnly, verification per side); optional LEVERAGE
    and MARGIN_TYPE are applied BEFORE the entry; MAX_TOTAL_NOTIONAL_USD and MAX_DAILY_LOSS_USD (realized PnL + fees + funding,
    UTC day) refuse new orders (HTTP 403) before anything is changed or sent.
12. Dashboard: optional login for everything (DASHBOARD_PASSWORD, HTTP Basic, 10 wrong tries/min -> 429; /api/health stays open).
13. Honesty (scripts/apply-honesty.mjs): the old UI is an in-browser simulator. A banner now says so on every simulated tab; the
    "AI learning" button no longer invents win rates / profits; fake "connected, 36 ms" badges, the always-successful proxy test,
    the hard-coded "BULLISH 88%", and the always-"FOMC in 42 minutes" news calendar are labelled as samples; Telegram alerts about
    simulated trades are tagged [จำลอง] and HTML-escaped; the placeholder "live price" is no longer flagged live.
14. Phase 1: shadow tracking (see worker/phase1/AUDIT.md).

NOT done / still true:
- The simulated tabs were labelled, not turned into real features. Real data exists only on the Phase 1 and Backtest tabs.
- WorkstationView still sends a hard-coded regime ("TRENDING_BULL") and RSI (54) to the AI audit, so that audit judges fake inputs.
- Phase 1 has NO news / economic-calendar filter (the calendar in the old UI is fake). A real one needs a data source.
- Live Forex in the Phase 1 bot is still synthetic (real forex/gold exists only in the backtest); no funding fees in futures paper PnL.
- The AI filter's value is unproven until shadow data accumulates; Gemini confidence is not calibrated.
- Nothing here was run against real Binance (testnet included). The algo-order endpoint matches Binance's documentation.
