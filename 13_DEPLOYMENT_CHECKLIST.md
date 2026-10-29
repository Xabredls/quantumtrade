# Phase 1: Deployment Checklist

**Status**: Ready to Deploy ✅  
**All Files Created**: Yes ✅  
**Estimated Time**: 15 minutes  

---

## Files Provided by Claude

### Core Bot Files (5)
- [ ] `01_binance-spot.ts` → `worker/core/binance-spot.ts`
- [ ] `02_forex-mock.ts` → `worker/core/forex-mock.ts`
- [ ] `03_market-scanner.ts` → `worker/scanner/market-scanner.ts`
- [ ] `04_gemini-analyzer-improved.ts` → `worker/ai/gemini-analyzer-improved.ts`
- [ ] `05_worker-index.ts` → `worker/index.ts`

### Dashboard Files (2)
- [ ] `06_BotStatusView.tsx` → `src/components/bot-status/BotStatusView.tsx`
- [ ] `07_server.ts` → `src/server.ts` (REPLACE existing)

### Configuration Files (4)
- [ ] `08_env-example-dashboard` → `.env.example` (REPLACE)
- [ ] `09_env-example-worker` → `worker/.env.example` (REPLACE)
- [ ] `10_package-json-dashboard` → `package.json` (REPLACE)
- [ ] `11_package-json-worker` → `worker/package.json` (REPLACE)

### Documentation (2)
- [ ] `12_PHASE_1_COMPLETE_README.md` → `PHASE_1_README.md`
- [ ] `13_DEPLOYMENT_CHECKLIST.md` → This file

---

## Step-by-Step Deployment

### Phase 1A: Prepare Files (Windows PC - 5 min)

```powershell
# 1. Navigate to repo
cd C:\Users\digit\OneDrive\Documents\Au\003_App\004_quantumtrade-ai-trading-bot

# 2. Create directories if missing
mkdir -p worker\core
mkdir -p worker\scanner
mkdir -p worker\ai
mkdir -p worker\orders
mkdir -p worker\db
mkdir -p src\components\bot-status

# 3. Copy files from Claude outputs:
# Copy each file from 01_ to 11_ to the paths above

# 4. Update .env files
cp .env.example .env
cp worker\.env.example worker\.env

# Verify keys are populated:
# - BINANCE_TESTNET_API_KEY (already set)
# - BINANCE_TESTNET_API_SECRET (already set)
# - GEMINI_API_KEY (already set)
# - WORKER_TOKEN (already set)
```

### Phase 1B: Deploy Worker (Windows PC - 5 min)

```powershell
# 1. Navigate to worker
cd C:\Users\digit\OneDrive\Documents\Au\003_App\004_quantumtrade-ai-trading-bot\worker

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Start worker
npm run dev

# Wait for output:
# "🤖 Phase 1: Multi-Bot AI Trading Suite"
# "✅ Services initialized"
# "🚀 Worker listening on 100.85.216.9:4000"

# KEEP THIS TERMINAL OPEN ✅
```

### Phase 1C: Commit to GitHub (PowerShell - 2 min)

```powershell
# From repo root (NOT in worker directory)
cd C:\Users\digit\OneDrive\Documents\Au\003_App\004_quantumtrade-ai-trading-bot

# 1. Stage changes
git add .

# 2. Commit
git commit -m "Phase 1: Multi-bot scanner + Gemini AI + DRY_RUN learning"

# 3. Push to main
git push origin main

# Verify on GitHub web UI
```

### Phase 1D: Deploy Dashboard (VM - 5 min)

```bash
# 1. SSH to VM
ssh xabre_bot@100.99.35.24

# 2. Navigate to repo
cd ~/quantumtrade

# 3. Pull latest
git pull origin main

# 4. Install dependencies
npm install --legacy-peer-deps

# 5. Test connection to worker
curl http://100.85.216.9:4000/health

# Should return:
# {
#   "ok": true,
#   "phase": 1,
#   "status": "running",
#   ...
# }

# 6. Restart systemd service
sudo systemctl restart quantumtrade

# 7. Check status
sudo systemctl status quantumtrade

# Should show: "active (running)"
```

---

## Verification Checklist

### Worker (PC)
```powershell
# Terminal should show:
[ ] Phase 1: Multi-Bot AI Trading Suite
[ ] ✅ Services initialized
[ ] 🚀 Worker listening on 100.85.216.9:4000
[ ] 🔄 Starting periodic scanning every 300s
```

### Dashboard (VM)
```bash
# Check logs:
sudo journalctl -u quantumtrade -n 20

# Should show:
[ ] Dashboard running on 100.99.35.24:3000
[ ] Worker URL: http://100.85.216.9:4000
```

### API Health Check
```bash
# From VM:
curl http://100.85.216.9:4000/health

# Should return:
[ ] "ok": true
[ ] "phase": 1
[ ] "status": "running"
[ ] "bots": { futures: "✅", spot: "✅", forex: "✅" }
```

### Mobile Access
```
[ ] Open browser on mobile
[ ] Navigate to https://100.99.35.24:3000 (over Tailscale)
[ ] BotStatusView loads
[ ] Shows "Phase 1: Multi-Bot Status"
[ ] All 3 bots show connected
```

### First Scan
```bash
# Wait 5 minutes or trigger manually:
curl -X POST http://100.99.35.24:3000/api/worker/scan

# Should log signals in worker terminal:
[ ] "📊 Signals to analyze: X"
[ ] "✅ Scan complete. Orders: X"
```

---

## Environment Variable Checklist

### Dashboard (.env)
```
[ ] HOST=100.99.35.24
[ ] PORT=3000
[ ] GEMINI_API_KEY=AQ.Ab8R... (populated)
[ ] WORKER_URL=http://100.85.216.9:4000
[ ] WORKER_TOKEN=c4aaa1... (populated)
```

### Worker (worker/.env)
```
[ ] BINANCE_ENV=testnet
[ ] BINANCE_TESTNET_API_KEY=ckcpzD... (populated)
[ ] BINANCE_TESTNET_API_SECRET=gTdsxv... (populated)
[ ] GEMINI_API_KEY=AQ.Ab8R... (populated)
[ ] WORKER_HOST=100.85.216.9
[ ] WORKER_PORT=4000
[ ] WORKER_TOKEN=c4aaa1... (populated)
[ ] SCAN_INTERVAL=300000
[ ] VOLUME_FILTER=5000000
[ ] DRY_RUN=true ⚠️ (CRITICAL!)
```

---

## Common Errors & Solutions

### Error: "Cannot find module 'better-sqlite3'"
```powershell
npm install --legacy-peer-deps --save better-sqlite3
```

### Error: "BINANCE: Invalid API key"
- Check BINANCE_TESTNET_API_KEY in worker/.env
- Verify it's the testnet key, not live
- Ensure no extra spaces in .env

### Error: "Worker unreachable"
- Verify Tailscale is running on PC
- Check `tailscale status` on PC
- Verify worker is running: `npm run dev`
- Test connectivity: `ping 100.85.216.9` from VM

### Error: "Gemini API error"
- Check GEMINI_API_KEY format
- Ensure key starts with "AQ."
- Verify API is enabled on Google Cloud

### Error: "Port 4000 already in use"
```powershell
# Find process on port 4000
netstat -ano | findstr :4000
# Kill process (replace PID)
taskkill /PID XXXX /F
# Restart worker
npm run dev
```

---

## After Deployment

### Monitor Scans
```bash
# Watch worker output (PC)
npm run dev

# Watch dashboard logs (VM)
sudo journalctl -u quantumtrade -f
```

### Check Database
```bash
# On PC
sqlite3 /tmp/quantumtrade-phase1.db
> SELECT COUNT(*) FROM scan_results;
> SELECT COUNT(*) FROM orders;
```

### View Signals
```bash
# Most recent scan
sqlite3 /tmp/quantumtrade-phase1.db
> SELECT symbol, signal, confidence FROM scan_results ORDER BY timestamp DESC LIMIT 20;
```

---

## Success Criteria ✅

Phase 1 is successfully deployed when:

```
✅ Worker running on PC (100.85.216.9:4000)
✅ Dashboard running on VM (100.99.35.24:3000)
✅ Mobile can access dashboard via Tailscale
✅ First scan completes (check worker logs)
✅ 3 bots show "Connected" on dashboard
✅ Gemini analyzer processes signals
✅ Orders logged to SQLite
✅ DRY_RUN=true (no real orders)
✅ All 10 improvements implemented
✅ No errors in logs after 5 minutes
```

---

## Next Steps (Week 1)

1. **Monitor**: Watch bot performance for 7 days
2. **Analyze**: Review SQLite data for patterns
3. **Log**: Note which signals were most accurate
4. **Plan Phase 2**: Design improvements based on Phase 1 data

---

## Rollback (if needed)

```powershell
# If Phase 1 breaks something:
git reset --hard HEAD~1
git push -f origin main
```

---

## Support

**Issues?**
1. Check logs: `npm run dev` (Worker) or `systemctl status` (Dashboard)
2. Verify .env files have all keys
3. Test API connectivity: `curl http://IP:PORT/health`
4. Review error messages in console

**Success indicator**: No errors after 5 minutes = Phase 1 is running!

---

**Ready to Deploy?** ✅ YES

**Time Estimate**: 15 minutes  
**Risk Level**: Low (DRY_RUN=true)  
**Rollback Time**: 2 minutes  

**Let's go!** 🚀

