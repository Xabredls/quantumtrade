import dotenv from 'dotenv';
import http from 'node:http';
import Database from 'better-sqlite3';
import { MarketScanner } from './scanner/market-scanner.js';
import { GeminiAnalyzer } from './ai/gemini-analyzer-improved.js';
import { OrderManager } from './orders/order-manager.js';

dotenv.config({ path: './worker/.env' });

const BINANCE_API_KEY = process.env.BINANCE_TESTNET_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_TESTNET_API_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SCAN_INTERVAL = Number(process.env.SCAN_INTERVAL || 300000); // 5 min
const DRY_RUN = process.env.DRY_RUN === 'true';
const PORT = Number(process.env.WORKER_PORT || 4000);
const HOST = process.env.WORKER_HOST || '127.0.0.1';

let scanner: MarketScanner;
let analyzer: GeminiAnalyzer;
let orderManager: OrderManager;
let db: Database.Database;

let lastScanResult: any = null;
let totalOrders = 0;
let winCount = 0;
let lossCount = 0;

async function initializeServices(): Promise<void> {
  console.log('🤖 Phase 1: Multi-Bot AI Trading Suite');
  console.log('=====================================');

  // Validate credentials
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    console.error('❌ Missing BINANCE credentials in .env');
    process.exit(1);
  }

  if (!GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY in .env');
    process.exit(1);
  }

  scanner = new MarketScanner(BINANCE_API_KEY, BINANCE_API_SECRET);
  analyzer = new GeminiAnalyzer(GEMINI_API_KEY);
  orderManager = new OrderManager('/tmp/quantumtrade-phase1.db');
  db = new Database('/tmp/quantumtrade-phase1.db');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY,
      timestamp INTEGER,
      bot TEXT,
      symbol TEXT,
      signal TEXT,
      confidence REAL,
      price REAL
    );
    
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      side TEXT,
      confidence REAL,
      positionSize INTEGER,
      timestamp INTEGER,
      dryRun INTEGER
    );
  `);

  console.log('✅ Services initialized');
  console.log(`   Scanner: ${BINANCE_API_KEY.slice(0, 10)}...`);
  console.log(`   Gemini: ${GEMINI_API_KEY.slice(0, 10)}...`);
  console.log(`   Mode: DRY_RUN=${DRY_RUN}`);
  console.log(`   Scan interval: ${SCAN_INTERVAL / 1000}s`);
}

async function performScan(): Promise<void> {
  try {
    console.log(`\n⏰ [${new Date().toISOString()}] Starting scan round...`);

    const scanRound = await scanner.scanRound();
    lastScanResult = scanRound;

    // Batch all signals for Gemini
    const allSignals = [
      ...scanRound.futures.signals.map((s) => ({
        ...s,
        reason: `Futures ${s.signal}`,
      })),
      ...scanRound.spot.signals.map((s) => ({
        ...s,
        reason: `Spot ${s.signal}`,
      })),
      ...scanRound.forex.signals.map((s) => ({
        ...s,
        reason: `Forex ${s.signal}`,
      })),
    ];

    if (allSignals.length === 0) {
      console.log('  ℹ️  No signals above threshold');
      return;
    }

    console.log(`  📊 Signals to analyze: ${allSignals.length}`);

    // Get AI decisions
    const decisions = await analyzer.analyzeSignalsBatch(
      allSignals.map((s) => ({
        symbol: s.symbol,
        signal: s.signal,
        technicalConfidence: s.confidence,
        reason: s.reason,
      }))
    );

    // Filter by confidence & place orders
    const highConfidenceDecisions = decisions.filter((d) => d.confidence > 0.6 && d.decision !== 'HOLD');

    for (const decision of highConfidenceDecisions) {
      const orderId = `${decision.symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (DRY_RUN) {
        console.log(
          `  💰 [DRY] ${decision.decision} ${decision.symbol} | Conf: ${decision.confidence.toFixed(2)} | Size: $${decision.positionSize}`
        );
      } else {
        console.log(
          `  ✅ [LIVE] ${decision.decision} ${decision.symbol} | Conf: ${decision.confidence.toFixed(2)} | Size: $${decision.positionSize}`
        );
      }

      orderManager.logOrder({
        id: orderId,
        symbol: decision.symbol,
        side: decision.decision === 'BUY' ? 'BUY' : 'SELL',
        confidence: decision.confidence,
        timestamp: Date.now(),
        dryRun: DRY_RUN,
      });

      db.prepare(
        `INSERT INTO orders (id, symbol, side, confidence, positionSize, timestamp, dryRun) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(orderId, decision.symbol, decision.decision, decision.confidence, decision.positionSize, Date.now(), DRY_RUN ? 1 : 0);

      totalOrders++;
    }

    // Log scan to DB
    for (const decision of highConfidenceDecisions) {
      db.prepare(
        `INSERT INTO scan_results (timestamp, bot, symbol, signal, confidence, price) 
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(Date.now(), 'multi', decision.symbol, decision.decision, decision.confidence, 0);
    }

    console.log(`  ✅ Scan complete. Orders: ${highConfidenceDecisions.length}`);
    console.log(`  📈 Gemini quota: ${analyzer.getStats().remainingQuota}/${analyzer.getStats().callsThisHour + analyzer.getStats().remainingQuota}`);
  } catch (e) {
    console.error('❌ Scan error:', e);
  }
}

async function startPeriodicScanning(): Promise<void> {
  console.log(`\n🔄 Starting periodic scanning every ${SCAN_INTERVAL / 1000}s...\n`);
  await performScan();
  setInterval(performScan, SCAN_INTERVAL);
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/health') {
    const botStatus = await scanner.getBotStatus();
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        phase: 1,
        status: 'running',
        dryRun: DRY_RUN,
        bots: botStatus,
        totalOrders,
        lastScan: lastScanResult?.timestamp,
      })
    );
  } else if (url.pathname === '/stats') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        totalOrders,
        scanInterval: SCAN_INTERVAL / 1000,
        geminiQuota: analyzer.getStats(),
      })
    );
  } else if (url.pathname === '/scan') {
    await performScan();
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        message: 'Scan triggered',
        result: lastScanResult,
      })
    );
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Startup
async function main(): Promise<void> {
  try {
    await initializeServices();
    await startPeriodicScanning();

    server.listen(PORT, HOST, () => {
      console.log(`\n🚀 Worker listening on ${HOST}:${PORT}`);
      console.log('   GET /health     - Status check');
      console.log('   GET /stats      - Statistics');
      console.log('   POST /scan      - Trigger scan\n');
    });
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();
