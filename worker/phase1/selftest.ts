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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    assert.ok(bad.store.recentSignals(10).every((s) => s.skip_reason === 'ai_unavailable' || s.skip_reason === 'spot_long_only'));
    const none = await mk(null);
    await none.engine.runCycle();
    assert.equal(none.store.openPositions().length, 0);
    const low = await mk(aiAll(0.55));
    await low.engine.runCycle();
    assert.equal(low.store.openPositions().length, 0);
    assert.ok(low.store.recentSignals(10).every((s) => s.skip_reason === 'low_confidence' || s.skip_reason === 'spot_long_only'));
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

  console.log('\nfixes found in the audit');
  await test('shared exit rules: stop-first, gap fills, slippage only on market exits', async () => {
    const { exitCheck, entryFill, timeoutFill } = await import('./paper.ts');
    const c = (o: number, h: number, l: number, cl: number): Candle => ({ openTime: 0, open: o, high: h, low: l, close: cl, volume: 1, closeTime: 1 });
    const long = { side: 'BUY' as const, sl: 99, tp: 102 };
    assert.deepEqual(exitCheck(long, c(100, 103, 98, 100), 0), { price: 99, outcome: 'sl' }); // both touched => stop
    assert.deepEqual(exitCheck(long, c(98, 99, 97, 98), 0), { price: 98, outcome: 'sl' }); // gap below the stop fills at the open
    assert.deepEqual(exitCheck(long, c(103, 104, 102.5, 103), 0), { price: 103, outcome: 'tp' }); // gap above target: better price
    assert.ok(Math.abs(exitCheck(long, c(100, 100.5, 98.9, 99.5), 1)!.price - 99 * 0.99) < 1e-9); // 1% slippage on a stop
    assert.equal(exitCheck(long, c(100, 102, 99.5, 101), 1)!.price, 102); // limit target: no slippage
    const short = { side: 'SELL' as const, sl: 101, tp: 98 };
    assert.deepEqual(exitCheck(short, c(100, 101.5, 97.5, 100), 0), { price: 101, outcome: 'sl' });
    assert.equal(exitCheck(short, c(100, 100.5, 99.5, 100), 0), null);
    assert.ok(entryFill('BUY', 100, 1) > 100 && entryFill('SELL', 100, 1) < 100);
    assert.ok(timeoutFill('BUY', 100, 1) < 100 && timeoutFill('SELL', 100, 1) > 100);
  });
  await test('entry uses the LIVE price (last candle), not the stale last close', async () => {
    const t = await mk(aiAll(0.85), { SLIPPAGE_PCT: '0' });
    // make the forming candle (the last one) move away from the last closed candle
    const data = (t.fut as any).data as Record<string, Candle[]>;
    const arr = data.AAAUSDT;
    const last = arr[arr.length - 1];
    arr[arr.length - 1] = { ...last, close: last.close * 1.001, high: Math.max(last.high, last.close * 1.001) };
    await t.engine.runCycle();
    const p = t.store.openPositions('futures', 'AAAUSDT')[0];
    assert.ok(p, 'position opened');
    assert.ok(Math.abs(p.entry - arr[arr.length - 1].close) < 1e-9);
  });
  await test('spot SELL candidates never reach the AI, so they cannot use its quota', async () => {
    let sentToAi: string[] = [];
    const spy: AiAnalyzer = { model: 's', async analyze(c: Candidate[]) { sentToAi = c.map(keyOf); return new Map(); } };
    const t = await mk(spy);
    await t.engine.runCycle();
    assert.ok(sentToAi.length > 0 && !sentToAi.includes('spot:BBBUSDT'));
    assert.ok(t.store.recentSignals(50).some((s) => s.bot === 'spot' && s.symbol === 'BBBUSDT' && s.skip_reason === 'spot_long_only'));
  });
  await test('AI quota ties go to the most liquid symbol, deterministically', async () => {
    let order: string[] = [];
    const spy: AiAnalyzer = { model: 's', async analyze(c: Candidate[]) { order = c.map((x) => x.symbol); return new Map(); } };
    const t = await mk(spy, { PHASE1_BOTS: 'futures' });
    await t.engine.runCycle();
    const first = [...order];
    const t2 = await mk(spy, { PHASE1_BOTS: 'futures' });
    await t2.engine.runCycle();
    assert.deepEqual(order, first);
  });
  await test('breaker is a timed pause (not a permanent latch) and re-trips on the next losing streak', async () => {
    const { breakerState } = await import('./paper.ts');
    const L = (closedAt: number, pnl = -1) => ({ closedAt, pnl });
    assert.deepEqual(breakerState([L(300), L(200), L(100)], 400, 3, 1000), { active: true, until: 1300 });
    assert.equal(breakerState([L(300), L(200), L(100)], 1301, 3, 1000).active, false); // pause over
    assert.equal(breakerState([L(300), L(200, 5), L(100)], 400, 3, 1000).active, false); // a win inside the streak
    assert.equal(breakerState([L(300), L(200)], 400, 3, 1000).active, false); // not enough trades
    assert.equal(breakerState([L(300), L(200), L(100)], 400, 3, 1000, 250).active, false); // reset after those trades
  });
  await test('per-side cap stops a one-way pile-up (market-wide moves)', async () => {
    const { gate } = await import('./paper.ts');
    const base = { bot: 'futures' as const, side: 'SELL' as const, symbol: 'X', now: 1e9, openForBot: 5, openForSide: 12, openOnSymbol: [], breakerActive: false, limits: { maxOpenPerBot: 20, maxOpenPerSide: 12, maxOrdersPerSymbol: 3, cooldownMs: 0 } };
    assert.equal(gate(base), 'max_open_side');
    assert.equal(gate({ ...base, openForSide: 11 }), null);
    assert.equal(gate({ ...base, bot: 'spot' }), 'spot_long_only');
  });

  console.log('\nshadow tracking (does the AI filter actually help?)');
  const aiMixed = (reject: string[]): AiAnalyzer => ({
    model: 's',
    async analyze(cands: Candidate[]) {
      return new Map<string, AiVerdict>(cands.map((c) => { const no = reject.includes(c.symbol); return [keyOf(c), { key: keyOf(c), decision: no ? 'SKIP' : c.side, confidence: no ? 0.3 : 0.85, rationale: 'stub' } as AiVerdict]; }));
    },
  });
  await test('AI-rejected signals become SHADOW positions, separate from real stats/caps/breaker', async () => {
    const t = await mk(aiMixed(['BBBUSDT']), { PHASE1_BOTS: 'futures' });
    await t.engine.runCycle();
    assert.deepEqual(t.store.openPositions('futures').map((p) => `${p.symbol}:${p.side}`), ['AAAUSDT:BUY']);
    const sh = t.store.openPositions('futures', undefined, 'shadow');
    assert.deepEqual(sh.map((p) => `${p.symbol}:${p.side}:${p.shadow}`), ['BBBUSDT:SELL:1']);
    assert.equal(sh[0].size_usd, 15);
    const sig = t.store.recentSignals(10).find((x) => x.symbol === 'BBBUSDT')!;
    assert.equal(sig.action, 'SHADOW'); assert.equal(sig.skip_reason, 'ai_skip');
    assert.equal(t.store.stats('futures').open, 1); assert.equal(t.store.stats('futures', 'shadow').open, 1);
    const st: any = t.engine.status();
    assert.equal(st.bots.futures.open, 1); assert.equal(st.bots.futures.shadow.open, 1);
  });
  await test('shadow positions have their own caps: a full real book does not stop shadows (and vice versa)', async () => {
    const t = await mk(aiMixed(['BBBUSDT']), { PHASE1_BOTS: 'futures', MAX_OPEN_PER_BOT: '1' });
    await t.engine.runCycle();
    assert.equal(t.store.openPositions('futures').length, 1);
    assert.equal(t.store.openPositions('futures', undefined, 'shadow').length, 1);
  });
  await test('shadow positions resolve by the same rules and never touch real stats', async () => {
    const t = await mk(aiMixed(['BBBUSDT']), { PHASE1_BOTS: 'futures', SLIPPAGE_PCT: '0' });
    await t.engine.runCycle();
    const shadow = t.store.openPositions('futures', 'BBBUSDT', 'shadow')[0];
    t.advance(MS * 2);
    const after = t.now();
    t.fut.extra.set('BBBUSDT', [{ openTime: after - MS, open: shadow.entry, high: shadow.entry, low: shadow.tp * 0.999, close: shadow.tp, volume: 1, closeTime: after - 1 }]); // the short reaches its target
    await t.engine.runCycle();
    const s = t.store.stats('futures', 'shadow');
    assert.equal(s.closed, 1); assert.equal(s.wins, 1); assert.ok(s.expectancyR! > 0);
    assert.equal(t.store.stats('futures').closed, 0, 'real stats are untouched');
    assert.equal(t.store.recentClosed({ limit: 10 }).length, 0);
    assert.equal(t.store.recentClosed({ limit: 10, kind: 'shadow' }).length, 1);
  });
  await test('shadow losses never trip the circuit breaker; real losses do', async () => {
    const t = await mk(aiAll(0.85));
    const add = (shadow: boolean, i: number) => { const id = t.store.openPosition({ openedAt: NOW, bot: 'futures', symbol: 'Z' + i, side: 'BUY', entry: 100, sl: 99, tp: 102, sizeUsd: 15, confidence: 0.5, techScore: 0.7, signalId: null, shadow }); t.store.closePosition(id, NOW + i + 1, 99, -0.2, 'sl'); };
    add(true, 1); add(true, 2); add(true, 3);
    assert.equal(t.engine.breakerTripped('futures'), false);
    add(false, 4); add(false, 5); add(false, 6);
    assert.equal(t.engine.breakerTripped('futures'), true);
  });
  await test('no shadow when the AI gave no answer, when the signal never reached the AI, or when switched off', async () => {
    const down = await mk({ model: 's', analyze: async () => { throw new Error('boom'); } }, { PHASE1_BOTS: 'futures' });
    await down.engine.runCycle();
    assert.equal(down.store.openPositions('futures', undefined, 'shadow').length, 0);
    const capped = await mk(aiMixed(['AAAUSDT', 'BBBUSDT']), { PHASE1_BOTS: 'futures', AI_MAX_CANDIDATES: '1' });
    await capped.engine.runCycle();
    assert.equal(capped.store.openPositions('futures', undefined, 'shadow').length, 1, 'only the one signal the AI actually saw');
    const off = await mk(aiMixed(['BBBUSDT']), { PHASE1_BOTS: 'futures', SHADOW_TRACKING: 'false' });
    await off.engine.runCycle();
    assert.equal(off.store.openPositions('futures', undefined, 'shadow').length, 0);
  });
  await test('an older database (no shadow column) is upgraded in place; old rows count as real', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qt-mig-')), 'old.db');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE positions (id INTEGER PRIMARY KEY, opened_at INTEGER, bot TEXT, symbol TEXT, side TEXT, entry REAL, sl REAL, tp REAL, size_usd REAL, confidence REAL, tech_score REAL, status TEXT, closed_at INTEGER, exit_price REAL, pnl_usd REAL, outcome TEXT, signal_id INTEGER)");
    db.exec("INSERT INTO positions (opened_at,bot,symbol,side,entry,sl,tp,size_usd,confidence,tech_score,status,closed_at,exit_price,pnl_usd,outcome) VALUES (1,'futures','OLD','BUY',100,99,102,20,0.7,0.8,'closed',2,102,0.4,'tp')");
    db.close();
    const store = await openStore(file);
    assert.equal(store.stats('futures').closed, 1); assert.equal(store.stats('futures', 'shadow').closed, 0);
    store.openPosition({ openedAt: 3, bot: 'futures', symbol: 'NEW', side: 'BUY', entry: 1, sl: 0.9, tp: 1.2, sizeUsd: 15, confidence: 0.3, techScore: 0.7, signalId: null, shadow: true });
    assert.equal(store.stats('futures', 'shadow').open, 1);
    store.close();
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
