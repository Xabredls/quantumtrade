# QuantumTrade – deployment layout

```
 phone ──Tailscale──▶ [Google free-tier VM, US]  dashboard + Gemini  ──Tailscale──▶ [worker, permitted location]──▶ Binance
```
- The US VM never talks to Binance (Binance blocks US IPs, HTTP 451). It only serves the UI and calls Gemini.
- The worker holds the API keys and sends orders from a location where Binance access is permitted. Do not
  route the US VM through a proxy/VPN to hide its location.
- Start on `BINANCE_ENV=testnet`, `DRY_RUN=true`. Go live only after testnet results are verified.
- Free-tier VM egress is only 1 GB/month; keep the dashboard light.
- The 24/7 strategy loop still runs in the browser (App.tsx, simulated prices). Not yet ported to the worker.
