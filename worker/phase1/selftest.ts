/**
 * Offline self-test — no Binance / Gemini / internet needed (it talks to tiny fake servers on localhost).
 * Run from the repo root:  npx tsx worker/phase1/selftest.ts
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { atr, confirmedSignal, ema, macdHistogram, rsi } from './indicators.ts';
import { BinanceMarket, RateLimitError } from './binance-market.ts';
import { loadConfig } from './config.ts';
import { Phase1Engine, pnlUsd, sizeForConfidence } from './engine.ts';
import { ForexMock } from './forex-mock.ts';
import { GeminiAnalyzer } from './gemini.ts';
import { handlePhase1 } from './api.ts';
import { openStore } from './store.ts';
import type { AiAnalyzer, AiVerdict, Candidate, Candle, MarketProvider } from './types.ts';
import { keyOf } from './types.ts';

let passed = 0, failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${(e as Error).message.split('\n').slice(0, 4).join('\n     ')}`); }
}

// ---- helpers -------------------------------------------------------------------------------
const MS = 900_000;
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function series(drift: number, seed: number, now: number, n = 120): Candle[] {
  const r = rng(seed); let p = 100; const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = o * (1 + drift + (r() - 0.5) * 0.008);
    const openTime = now - (n - i) * MS;
    out.push({ openTime, open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c, volume: 1, closeTime: openTime + MS - 1 });
    p = c;
  }
  return out;
}
const findSeed = (drift: number, side: 'BUY' | 'SELL', now: number) => {
  for (let s = 1; s < 500; s++) if (confirmedSignal(series(drift, s, now), { confirm: 3, minScore: 0.65, now })?.side === side) return s;
  throw new Error(`no ${side} seed found`);
};
const listen = (handler: http.RequestListener) => new Promise<{ url: string; close: () => void }>((resolve) => {
  const srv = http.createServer(handler).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
});

class StubProvider implements MarketProvider {
  extra = new Map<string, Candle[]>();
  constructor(readonly bot: 'futures' | 'spot' | 'forex', private data: Record<string, Candle[]>) {}
  async listSymbols() { return { universe: 99, symbols: Object.keys(this.data).map((symbol) => ({ symbol, quoteVolume: 9e6 })) }; }
  async candles(symbol: string) { return [...this.data[symbol], ...(this.extra.get(symbol) ?? [])]; }
}
const aiAll = (conf: number): AiAnalyzer => ({
  model: 'stub',
  async analyze(cands: Candidate[]) { return new Map<string, AiVerdict>(cands.map((c) => [keyOf(c), { key: keyOf(c), decision: c.side, confidence: conf, rationale: 'stub' }])); },
});

async function main() {
  console.log('\nindicators');
  await test('EMA/RSI/MACD/ATR basic properties', () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i);
    assert.equal(rsi(up)[59], 100);
    assert.equal(rsi(new Array(60).fill(5))[59], 50);
    assert.ok(Math.abs(ema(up, 10)[59] - 154.5) < 1e-3); // EMA of a slope-1 line lags by (period-1)/2 = 4.5
    assert.ok(macdHistogram(up).slice(-1)[0] !== undefined);
    const flat: Candle[] = Array.from({ length: 30 }, (_, i) => ({ openTime: i, open: 10, high: 11, low: 9, close: 10, volume: 1, closeTime: i }));
    assert.ok(Math.abs(atr(flat)[29] - 2) < 1e-9);
    assert.equal(Number.isNaN(ema([1, 2], 5)[1]), true);
  });
  const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
  const upSeed = findSeed(0.0012, 'BUY', NOW), dnSeed = findSeed(-0.0012, 'SELL', NOW);
  await test('confirmedSignal: BUY on uptrend, SELL on downtrend, ignores forming candle', () => {
    assert.equal(confirmedSignal(series(0.0012, upSeed, NOW), { confirm: 3, minScore: 0.65, now: NOW })?.side, 'BUY');
    assert.equal(confirmedSignal(series(-0.0012, dnSeed, NOW), { confirm: 3, minScore: 0.65, now: NOW })?.side, 'SELL');
    const c = series(0.0012, upSeed, NOW);
    const forming = { ...c[c.length - 1], close: 1, low: 1, closeTime: NOW + 10 * MS }; // absurd candle that has not closed yet
    const opts = { confirm: 3, minScore: 0.65, now: NOW };
    assert.deepEqual(confirmedSignal([...c, forming], opts), confirmedSignal(c, opts));
    assert.ok(confirmedSignal(c, opts)!.atr > 0);
  });
  await test('too little data -> no signal', () => assert.equal(confirmedSignal(series(0.001, 1, NOW, 40), { confirm: 3, minScore: 0.5, now: NOW }), null));

  console.log('\nmoney maths');
  await test('position size by confidence, capped by MAX_NOTIONAL', () => {
    assert.deepEqual([0.6, 0.69, 0.7, 0.79, 0.8, 0.89, 0.9, 1].map((c) => sizeForConfidence(c, 50)), [15, 15, 20, 20, 25, 25, 30, 30]);
    assert.equal(sizeForConfidence(0.95, 20), 20);
  });
  await test('pnl: long/short, fees', () => {
    assert.ok(Math.abs(pnlUsd('BUY', 100, 102, 25, 0) - 0.5) < 1e-9);
    assert.ok(Math.abs(pnlUsd('SELL', 100, 98, 25, 0) - 0.5) < 1e-9);
    assert.ok(pnlUsd('BUY', 100, 100, 25, 0.1) < 0, 'round trip at same price loses the fees');
  });

  console.log('\nconfig');
  await test('config validation fails early', () => {
    assert.throws(() => loadConfig({ DRY_RUN: 'false' }), /DRY_RUN/);
    assert.throws(() => loadConfig({ SCAN_INTERVAL_MS: '1000' }), /SCAN_INTERVAL_MS/);
    assert.throws(() => loadConfig({ KLINE_INTERVAL: '7m' }), /KLINE_INTERVAL/);
    assert.throws(() => loadConfig({ PHASE1_BOTS: 'futures,oops' }), /PHASE1_BOTS/);
    assert.equal(loadConfig({}).minAiConfidence, 0.6);
  });

  console.log('\nBinance public client (fake server)');
  let hits429 = 0;
  const fake = await listen((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const json = (o: unknown, code = 200, h: Record<string, string> = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/fapi/v1/exchangeInfo') return json({ symbols: [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'USDCUSDT', baseAsset: 'USDC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'DEADUSDT', baseAsset: 'DEAD', quoteAsset: 'USDT', status: 'BREAK', contractType: 'PERPETUAL' },
      { symbol: 'LOWUSDT', baseAsset: 'LOW', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'BTCUSDT_261225', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'CURRENT_QUARTER' },
      { symbol: 'BTCBUSD', baseAsset: 'BTC', quoteAsset: 'BUSD', status: 'TRADING', contractType: 'PERPETUAL' },
    ] });
    if (u.pathname === '/fapi/v1/ticker/24hr') return json([
      { symbol: 'BTCUSDT', quoteVolume: '9000000000' }, { symbol: 'ETHUSDT', quoteVolume: '6000000' }, { symbol: 'USDCUSDT', quoteVolume: '9999999999' },
      { symbol: 'DEADUSDT', quoteVolume: '9000000' }, { symbol: 'LOWUSDT', quoteVolume: '4999999' }, { symbol: 'BTCUSDT_261225', quoteVolume: '9000000' }, { symbol: 'BTCBUSD', quoteVolume: '9000000' },
    ]);
    if (u.pathname === '/fapi/v1/klines') return json([[1, '1.5', '2', '1', '1.8', '10', 2, '0', 0, '0', '0', '0']]);
    if (u.pathname === '/limited') { hits429++; return json({ code: -1003 }, 429, { 'retry-after': '30' }); }
    json({}, 404);
  });
  await test('volume filter, stablecoins, status, perpetual-only, sorted by volume', async () => {
    const m = new BinanceMarket('futures', { dataSource: 'live', minQuoteVolume: 5_000_000, maxSymbols: 100, baseUrl: fake.url });
    const l = await m.listSymbols();
    assert.deepEqual(l.symbols.map((s) => s.symbol), ['BTCUSDT', 'ETHUSDT']);
    assert.equal(l.universe, 3); // BTC, ETH, LOW pass the tradable filter before the volume filter
  });
  await test('kline parsing', async () => {
    const m = new BinanceMarket('futures', { dataSource: 'live', minQuoteVolume: 0, maxSymbols: 10, baseUrl: fake.url });
    const c = await m.candles('BTCUSDT', '15m', 100);
    assert.deepEqual(c[0], { openTime: 1, open: 1.5, high: 2, low: 1, close: 1.8, volume: 10, closeTime: 2 });
  });
  await test('HTTP 429 -> RateLimitError, then backs off without hitting the server', async () => {
    const m = new BinanceMarket('futures', { dataSource: 'live', minQuoteVolume: 0, maxSymbols: 10, baseUrl: fake.url }) as any;
    await assert.rejects(() => m.get('/limited'), RateLimitError);
    await assert.rejects(() => m.get('/limited'), RateLimitError);
    assert.equal(hits429, 1);
  });
  fake.close();

  console.log('\nGemini client (fake server)');
  const mkCand = (bot: 'futures' | 'spot', symbol: string, side: 'BUY' | 'SELL'): Candidate => ({ bot, symbol, side, techScore: 0.8, price: 100, atr: 1, rsi: 55, macdHist: 0.1, emaFast: 101, emaSlow: 99, quoteVolume: 1e7, reasons: ['x'] });
  await test('parses verdicts, keeps futures/spot apart, clamps, ignores junk', async () => {
    let seenKey = '';
    const g = await listen((req, res) => {
      seenKey = String(req.headers['x-goog-api-key']);
      const text = JSON.stringify([
        { key: 'futures:AAAUSDT', decision: 'BUY', confidence: 1.7, rationale: 'ok' },
        { key: 'spot:AAAUSDT', decision: 'SELL', confidence: 0.9, rationale: 'conflicts with proposed BUY' },
        { key: 'futures:ZZZ', decision: 'BUY', confidence: 0.9, rationale: 'unknown key' },
        { key: 'futures:AAAUSDT', decision: 'SKIP', confidence: 0.1, rationale: 'duplicate' },
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    });
    const out = await new GeminiAnalyzer({ apiKey: 'K', model: 'm', baseUrl: g.url }).analyze([mkCand('futures', 'AAAUSDT', 'BUY'), mkCand('spot', 'AAAUSDT', 'BUY')]);
    g.close();
    assert.equal(seenKey, 'K');
    assert.equal(out.size, 2);
    assert.deepEqual([out.get('futures:AAAUSDT')!.decision, out.get('futures:AAAUSDT')!.confidence], ['BUY', 1]);
    assert.equal(out.get('spot:AAAUSDT')!.decision, 'SKIP'); // opposite of proposed side => SKIP
  });
  await test('invalid JSON from the model -> throws (engine then fails closed)', async () => {
    const g = await listen((_q, res) => { res.writeHead(200); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })); });
    await assert.rejects(() => new GeminiAnalyzer({ apiKey: 'K', model: 'm', baseUrl: g.url }).analyze([mkCand('futures', 'A', 'BUY')]));
    g.close();
  });

  console.log('\nengine (in-memory DB, stub providers)');
  const mk = async (aiImpl: AiAnalyzer | null, extra: Record<string, string> = {}) => {
    let clock = NOW;
    const cfg = loadConfig({ PHASE1_BOTS: 'futures,spot', ...extra });
    const store = await openStore(':memory:');
    const fut = new StubProvider('futures', { AAAUSDT: series(0.0012, upSeed, NOW), BBBUSDT: series(-0.0012, dnSeed, NOW) });
    const spot = new StubProvider('spot', { AAAUSDT: series(0.0012, upSeed, NOW), BBBUSDT: series(-0.0012, dnSeed, NOW) });
    const logs: string[] = [];
    const engine = new Phase1Engine({ cfg, store, providers: { futures: fut, spot }, ai: aiImpl, now: () => clock, log: (m) => logs.push(m) });
    return { engine, store, fut, spot, logs, advance: (ms: number) => { clock += ms; }, now: () => clock };
  };
  await test('opens paper positions: sizes, spot long-only, SL/TP on the right sides', async () => {
    const t = await mk(aiAll(0.85));
    await t.engine.runCycle();
    const open = t.store.openPositions();
    const keys = open.map((p) => `${p.bot}:${p.symbol}:${p.side}`).sort();
    assert.deepEqual(keys, ['futures:AAAUSDT:BUY', 'futures:BBBUSDT:SELL', 'spot:AAAUSDT:BUY']);
    for (const p of open) {
      assert.equal(p.size_usd, 25);
      if (p.side === 'BUY') assert.ok(p.sl < p.entry && p.tp > p.entry); else assert.ok(p.sl > p.entry && p.tp < p.entry);
    }
    const sigs = t.store.recentSignals(20);
    assert.ok(sigs.some((s) => s.bot === 'spot' && s.symbol === 'BBBUSDT' && s.skip_reason === 'spot_long_only'));
  });
  await test('cooldown, then per-symbol cap of 3', async () => {
    const t = await mk(aiAll(0.85));
    await t.engine.runCycle();
    await t.engine.runCycle();
    assert.equal(t.store.openPositions('futures', 'AAAUSDT').length, 1, 'cooldown blocks an immediate repeat');
    for (let i = 0; i < 4; i++) { t.advance(16 * 60_000); await t.engine.runCycle(); }
    assert.equal(t.store.openPositions('futures', 'AAAUSDT').length, 3);
    assert.ok(t.store.recentSignals(100).some((s) => s.skip_reason === 'max_per_symbol'));
  });
  await test('fail closed: AI error / no key / low confidence -> signals logged, nothing opened', async () => {
    const bad = await mk({ model: 'x', analyze: async () => { throw new Error('boom'); } });
    await bad.engine.runCycle();
    assert.equal(bad.store.openPositions().length, 0);
    assert.ok(bad.store.recentSignals(10).every((s) => s.skip_reason === 'ai_unavailable'));
    const none = await mk(null);
    await none.engine.runCycle();
    assert.equal(none.store.openPositions().length, 0);
    const low = await mk(aiAll(0.55));
    await low.engine.runCycle();
    assert.equal(low.store.openPositions().length, 0);
    assert.ok(low.store.recentSignals(10).every((s) => s.skip_reason === 'low_confidence'));
  });
  await test('paper positions resolve to TP / SL / timeout with correct pnl', async () => {
    const t = await mk(aiAll(0.85), { SL_ATR_MULT: '1.5', TP_ATR_MULT: '2.25' });
    await t.engine.runCycle();
    const buy = t.store.openPositions('futures', 'AAAUSDT')[0];
    const sell = t.store.openPositions('futures', 'BBBUSDT')[0];
    t.advance(MS * 2);
    const after = t.now();
    const candle = (o: number, h: number, l: number, c: number): Candle => ({ openTime: after - MS, open: o, high: h, low: l, close: c, volume: 1, closeTime: after - 1 });
    t.fut.extra.set('AAAUSDT', [candle(buy.entry, buy.tp * 1.01, buy.entry * 0.999, buy.tp)]); // hits target only
    t.fut.extra.set('BBBUSDT', [candle(sell.entry, sell.sl * 1.01, sell.tp * 0.99, sell.entry)]); // touches BOTH => stop assumed first
    await t.engine.runCycle();
    const closed = t.store.recentClosed({ limit: 10 });
    const b = closed.find((p) => p.id === buy.id)!, s = closed.find((p) => p.id === sell.id)!;
    assert.equal(b.outcome, 'tp'); assert.ok(b.pnl_usd! > 0);
    assert.equal(s.outcome, 'sl'); assert.ok(s.pnl_usd! < 0);
    const st = t.store.stats('futures');
    assert.equal(st.closed, 2); assert.equal(st.winRate, 0.5);
    // timeout: a spot position with no hit, after MAX_HOLD_HOURS
    const spotPos = t.store.openPositions('spot', 'AAAUSDT')[0];
    t.advance(25 * 3600_000);
    await t.engine.runCycle();
    assert.equal(t.store.recentClosed({ bot: 'spot', limit: 10 }).find((p) => p.id === spotPos.id)?.outcome, 'timeout');
  });
  await test('circuit breaker: trips after 3 losses in a row, blocks entries, manual reset re-arms', async () => {
    const t = await mk(aiAll(0.85));
    const lose = (i: number) => { const id = t.store.openPosition({ openedAt: NOW, bot: 'futures', symbol: 'L' + i, side: 'BUY', entry: 100, sl: 99, tp: 102, sizeUsd: 20, confidence: 0.8, techScore: 0.8, signalId: null }); t.store.closePosition(id, NOW + i + 1, 99, -0.3, 'sl'); };
    lose(1); lose(2);
    assert.equal(t.engine.breakerTripped('futures'), false);
    lose(3);
    assert.equal(t.engine.breakerTripped('futures'), true);
    assert.equal(t.engine.breakerTripped('spot'), false);
    t.advance(1000);
    await t.engine.runCycle();
    assert.equal(t.store.openPositions('futures').length, 0);
    assert.ok(t.store.recentSignals(20).some((s) => s.bot === 'futures' && s.skip_reason === 'circuit_breaker'));
    t.advance(1000);
    t.engine.resetBreaker('futures');
    assert.equal(t.engine.breakerTripped('futures'), false);
  });
  await test('a win in between breaks the losing streak', async () => {
    const t = await mk(aiAll(0.85));
    const add = (i: number, pnl: number) => { const id = t.store.openPosition({ openedAt: NOW, bot: 'spot', symbol: 'S' + i, side: 'BUY', entry: 1, sl: 0.9, tp: 1.1, sizeUsd: 15, confidence: 0.7, techScore: 0.7, signalId: null }); t.store.closePosition(id, NOW + i, 1, pnl, pnl > 0 ? 'tp' : 'sl'); };
    add(1, -1); add(2, 2); add(3, -1); add(4, -1);
    assert.equal(t.engine.breakerTripped('spot'), false);
  });

  console.log('\nforex mock');
  await test('deterministic, 3 pairs, tick() adds a closed candle', async () => {
    const f = new ForexMock(300_000, 7, NOW), g = new ForexMock(300_000, 7, NOW);
    const l = await f.listSymbols();
    assert.deepEqual(l.symbols.map((s) => s.symbol), ['EURUSD', 'GBPUSD', 'XAUUSD']);
    const a = await f.candles('EURUSD', '', 100), b = await g.candles('EURUSD', '', 100);
    assert.deepEqual(a, b);
    assert.ok(a.every((c) => c.closeTime <= NOW));
    f.tick(NOW + 300_000);
    assert.equal((await f.candles('EURUSD', '', 1))[0].closeTime, NOW + 300_000 - 1);
  });

  console.log('\nHTTP API');
  await test('status / signals / scan / reset-breaker', async () => {
    const t = await mk(aiAll(0.85));
    const srv = await listen((req, res) => { void handlePhase1(req, res, t.engine, t.store); });
    const get = async (p: string, method = 'GET', body?: unknown) => { const r = await fetch(srv.url + p, { method, body: body ? JSON.stringify(body) : undefined }); return { code: r.status, body: await r.json() as any }; };
    assert.equal((await get('/phase1/status')).body.dryRun, true);
    assert.equal((await get('/phase1/signals?limit=5')).code, 200);
    assert.equal((await get('/phase1/reset-breaker', 'POST', { bot: 'nope' })).code, 400);
    assert.equal((await get('/phase1/reset-breaker', 'POST', { bot: 'spot' })).code, 200);
    assert.equal((await get('/phase1/scan', 'POST')).code, 202);
    for (let i = 0; i < 50 && t.engine.running; i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(t.engine.last, 'manual scan ran');
    assert.equal((await get('/phase1/nothing')).code, 404);
    srv.close();
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
