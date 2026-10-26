#!/bin/bash
# Trading worker: run where Binance is reachable per its terms (home PC / Raspberry Pi in Thailand, or a permitted VPS).
set -euo pipefail
APP=~/quantumtrade
curl -fsSL https://tailscale.com/install.sh | sh
echo ">> Run: sudo tailscale up --hostname=quantumtrade-worker ; put its 100.x IP in WORKER_HOST"
cd "$APP" && cp -n worker/.env.example worker/.env && npm ci
echo ">> Edit worker/.env, then test:  npm run worker   and   curl http://127.0.0.1:4000/health"
echo ">> Check you are not geo-blocked:  curl -s https://testnet.binancefuture.com/fapi/v1/time"
