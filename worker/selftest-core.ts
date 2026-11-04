/**
 * Offline self-test for the order path of the original worker (fake Binance Futures on localhost — no internet, no keys).
 * Run from the repo root:  npx tsx worker/selftest-core.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { BinanceFutures, RiskLimitError, UncertainRequestError, UnprotectedPositionError, ceilToStep, floorToStep } from './binance.ts';
import { GuardError, OrderGuard } from './order-guard.ts';

let passed = 0, failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${(e as Error).message.split('\n').slice(0, 5).join('\n     ')}`); }
}
const SECRET = 'test-secret';

interface Behavior { entry?: 'ok' | 'reject' | 'timeout-filled' | 'timeout-notfilled'; stopFails?: boolean; closeFails?: boolean; lookupFails?: boolean; skewMs?: number; hedge?: boolean; marginSame?: boolean; income?: Array<{ incomeType: string; income: string }>; seed?: Record<string, number> }
interface Rec { method: string; path: string; params: Record<string, string> }

/** Minimal fake of the Binance Futures endpoints the worker uses, including signature and clock checks. */
async function fakeBinance(b: Behavior = {}) {
  const log: Rec[] = [];
  const positions: Record<string, number> = { ...(b.seed ?? {}) }; // key: SYMBOL or SYMBOL|LONG / SYMBOL|SHORT in hedge mode
  const orders = new Map<string, any>();
  const mark: Record<string, number> = { BTCUSDT: 60000, ETHUSDT: 3000 };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const params = Object.fromEntries(u.searchParams);
    log.push({ method: req.method!, path: u.pathname, params });
    const json = (o: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const serverNow = Date.now() + (b.skewMs ?? 0);
    if (u.pathname === '/__behavior') { Object.assign(b, params.reset ? {} : {}); return json({ ok: true }); }
    if (u.pathname === '/fapi/v1/time') return json({ serverTime: serverNow });
    if (u.pathname === '/fapi/v1/exchangeInfo') {
      const mk = (symbol: string, tick: string, step: string, minQty: string, notional: string) => ({ symbol, filters: [{ filterType: 'PRICE_FILTER', tickSize: tick }, { filterType: 'LOT_SIZE', stepSize: step, minQty }, { filterType: 'MARKET_LOT_SIZE', stepSize: step, minQty }, { filterType: 'MIN_NOTIONAL', notional }] });
      return json({ symbols: [mk('BTCUSDT', '0.10', '0.001', '0.001', '5'), mk('ETHUSDT', '0.01', '0.001', '0.001', '5')] });
    }
    if (u.pathname === '/fapi/v1/premiumIndex') return json({ markPrice: String(mark[params.symbol] ?? 0) });
    // signed endpoints: check signature and clock like the real exchange
    const sig = params.signature;
    if (sig !== undefined) {
      const q = new URLSearchParams(u.searchParams); q.delete('signature');
      const want = crypto.createHmac('sha256', SECRET).update(q.toString()).digest('hex');
      if (sig !== want) return json({ code: -1022, msg: 'Signature for this request is not valid.' }, 400);
      if (Math.abs(serverNow - Number(params.timestamp)) > Number(params.recvWindow ?? 5000)) return json({ code: -1021, msg: 'Timestamp for this request is outside of the recvWindow.' }, 400);
    }
    if (u.pathname === '/fapi/v2/balance') return json([{ asset: 'USDT', availableBalance: '1000.0' }]);
    if (u.pathname === '/fapi/v2/positionRisk') {
      const rows = Object.entries(positions).filter(([k]) => !params.symbol || k.split('|')[0] === params.symbol).map(([k, amt]) => ({ symbol: k.split('|')[0], positionSide: k.split('|')[1] ?? 'BOTH', positionAmt: String(amt), markPrice: String(mark[k.split('|')[0]] ?? 0) }));
      return json(rows.length ? rows : [{ symbol: params.symbol ?? 'BTCUSDT', positionSide: 'BOTH', positionAmt: '0', markPrice: '0' }]);
    }
    if (u.pathname === '/fapi/v1/positionSide/dual') return json({ dualSidePosition: !!b.hedge });
    if (u.pathname === '/fapi/v1/leverage') return json({ symbol: params.symbol, leverage: Number(params.leverage) });
    if (u.pathname === '/fapi/v1/marginType') return b.marginSame ? json({ code: -4046, msg: 'No need to change margin type.' }, 400) : json({ code: 200, msg: 'success' });
    if (u.pathname === '/fapi/v1/income') return json(b.income ?? []);
    if (u.pathname === '/fapi/v1/order' && req.method === 'GET') {
      if (b.lookupFails) return json({ code: -1000, msg: 'boom' }, 500);
      const o = orders.get(params.origClientOrderId);
      return o ? json(o) : json({ code: -2013, msg: 'Order does not exist.' }, 400);
    }
    if (u.pathname === '/fapi/v1/order' && req.method === 'POST') {
      const key = (sym: string, ps?: string) => (b.hedge ? `${sym}|${ps}` : sym);
      if (b.hedge && !params.positionSide) return json({ code: -4061, msg: "Order's position side does not match user's setting." }, 400);
      if (!b.hedge && params.positionSide) return json({ code: -4061, msg: "Order's position side does not match user's setting." }, 400);
      if (params.reduceOnly === 'true') {
        if (b.hedge) return json({ code: -1106, msg: "Parameter 'reduceOnly' sent when not required." }, 400);
        if (b.closeFails) return json({ code: -2022, msg: 'ReduceOnly Order is rejected.' }, 400);
        positions[params.symbol] = 0;
        return json({ status: 'FILLED', executedQty: params.quantity });
      }
      // hedge mode: an order on the opposite side WITH the position's side closes that side
      const closing = b.hedge && ((params.positionSide === 'LONG' && params.side === 'SELL') || (params.positionSide === 'SHORT' && params.side === 'BUY'));
      if (closing) {
        if (b.closeFails) return json({ code: -2022, msg: 'Order rejected.' }, 400);
        positions[key(params.symbol, params.positionSide)] = 0;
        return json({ status: 'FILLED', executedQty: params.quantity });
      }
      if (b.entry === 'reject') return json({ code: -2019, msg: 'Margin is insufficient.' }, 400);
      const qty = Number(params.quantity);
      const filled = b.entry !== 'timeout-notfilled';
      const o = { orderId: orders.size + 1, clientOrderId: params.newClientOrderId, status: filled ? 'FILLED' : 'NEW', executedQty: filled ? params.quantity : '0', symbol: params.symbol };
      const k = key(params.symbol, params.positionSide);
      if (b.entry === 'timeout-filled') { orders.set(params.newClientOrderId, o); positions[k] = (positions[k] ?? 0) + (params.side === 'BUY' ? qty : -qty); req.socket.destroy(); return; }
      if (b.entry === 'timeout-notfilled') { req.socket.destroy(); return; }
      orders.set(params.newClientOrderId, o);
      positions[k] = (positions[k] ?? 0) + (params.side === 'BUY' ? qty : -qty);
      return json(o);
    }
    if (u.pathname === '/fapi/v1/algoOrder') {
      if (b.stopFails) return json({ code: -4164, msg: 'Order\'s notional must be no smaller than 5' }, 400);
      if (b.hedge && !params.positionSide) return json({ code: -4061, msg: "Order's position side does not match user's setting." }, 400);
      return json({ algoId: 1, triggerPrice: params.triggerPrice });
    }
    json({ code: -1, msg: 'unknown' }, 404);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, log, positions, behavior: b, close: () => srv.close(), posts: () => log.filter((l) => l.method === 'POST' && l.path !== '/__behavior') };
}

async function main() {
  console.log('\nrounding to exchange rules');
  await test('floor/ceil to step without float errors', () => {
    assert.equal(floorToStep(0.0129, 0.001), 0.012);
    assert.equal(floorToStep(0.3, 0.1), 0.3); // 0.3/0.1 = 2.9999999999999996 in floating point
    assert.equal(floorToStep(60123.456, 0.1), 60123.4);
    assert.equal(ceilToStep(100.01, 0.1), 100.1);
    assert.equal(ceilToStep(100.1, 0.1), 100.1);
    assert.equal(floorToStep(5, 0), 5);
  });

  console.log('\nBinanceFutures against a fake exchange');
  await test('prepare: rounds, and refuses what Binance would reject (before any order)', async () => {
    const f = await fakeBinance(); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    const ok = await c.prepare('BTCUSDT', 'BUY', 0.0129, 59000.77, 60000);
    assert.deepEqual([ok.qty, ok.stop], [0.012, 59000.7]); // stop floored for a long: away from the market
    const sh = await c.prepare('BTCUSDT', 'SELL', 0.0129, 61000.01, 60000);
    assert.equal(sh.stop, 61000.1); // ceiled for a short
    await assert.rejects(() => c.prepare('BTCUSDT', 'BUY', 0.0004, 59000, 60000), /น้อยกว่าขั้นต่ำ/);
    await assert.rejects(() => c.prepare('ETHUSDT', 'BUY', 0.001, 2900, 3000), /ขั้นต่ำของ Binance/); // 0.001 * 3000 = 3 USD < 5 USD minimum
    f.close();
  });
  await test('happy path: entry uses rounded quantity, stop is closePosition and rounded', async () => {
    const f = await fakeBinance(); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    const r = await c.openWithStop('BTCUSDT', 'BUY', 0.0129, 59000.77);
    assert.deepEqual(r.applied, { quantity: 0.012, stopPrice: 59000.7 });
    const posts = f.posts();
    assert.equal(posts.length, 2);
    assert.equal(posts[0].params.quantity, '0.012'); assert.ok(posts[0].params.newClientOrderId.startsWith('qt'));
    assert.equal(posts[1].path, '/fapi/v1/algoOrder'); assert.equal(posts[1].params.closePosition, 'true'); assert.equal(posts[1].params.side, 'SELL');
    f.close();
  });
  await test('an unplaceable order is refused BEFORE the entry (no open-then-close fee burn)', async () => {
    const f = await fakeBinance(); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.0002, 59000), /น้อยกว่าขั้นต่ำ/);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 60500), /ผิดฝั่ง/);
    assert.equal(f.posts().length, 0, 'no order may have been sent');
    f.close();
  });
  await test('stop fails -> position is closed AND the close is verified', async () => {
    const f = await fakeBinance({ stopFails: true }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), (e: Error) => !(e instanceof UnprotectedPositionError) && /ยืนยันจาก positionRisk/.test(e.message));
    assert.equal(f.positions.BTCUSDT, 0);
    f.close();
  });
  await test('stop fails AND close fails -> UnprotectedPositionError (never a false "closed")', async () => {
    const f = await fakeBinance({ stopFails: true, closeFails: true }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), (e: any) => e instanceof UnprotectedPositionError && e.detail.remaining === 0.01 && /ปิดด้วยมือ/.test(e.message));
    assert.equal(f.positions.BTCUSDT, 0.01);
    f.close();
  });
  await test('entry times out but WAS filled -> found by client id, stop still placed', async () => {
    const f = await fakeBinance({ entry: 'timeout-filled' }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    const r = await c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000);
    assert.ok(r.stop && f.posts().some((p) => p.path === '/fapi/v1/algoOrder'));
    f.close();
  });
  await test('entry times out and was NOT placed -> clear "no position" error, nothing else sent', async () => {
    const f = await fakeBinance({ entry: 'timeout-notfilled' }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), (e: Error) => !(e instanceof UnprotectedPositionError) && /ไม่มีตำแหน่งเปิด|ไม่มีออเดอร์/.test(e.message));
    assert.ok(!f.posts().some((p) => p.path === '/fapi/v1/algoOrder'));
    f.close();
  });
  await test('entry times out and the status check also fails -> UnprotectedPositionError', async () => {
    const f = await fakeBinance({ entry: 'timeout-filled', lookupFails: true }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), UnprotectedPositionError);
    f.close();
  });
  await test('exchange rejection of the entry is passed through (nothing opened, no stop attempted)', async () => {
    const f = await fakeBinance({ entry: 'reject' }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), (e: Error) => /-2019/.test(e.message) && !(e instanceof UncertainRequestError));
    assert.ok(!f.posts().some((p) => p.path === '/fapi/v1/algoOrder'));
    f.close();
  });
  await test('clock drift: re-syncs with the exchange instead of failing with -1021', async () => {
    const f = await fakeBinance({ skewMs: 20_000 }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    assert.match(await c.usdtBalance(), /1000/);
    f.behavior.skewMs = 0; // the PC clock was right at first ...
    assert.match(await c.usdtBalance(), /1000/);
    f.behavior.skewMs = 25_000; // ... and later drifted away from the exchange: the -1021 reply must trigger a re-sync and one retry
    const before = f.log.filter((l) => l.path === '/fapi/v2/balance').length;
    assert.match(await c.usdtBalance(), /1000/);
    assert.equal(f.log.filter((l) => l.path === '/fapi/v2/balance').length - before, 2, 'rejected once, then retried');
    f.close();
  });

  console.log('\nhedge mode, leverage / margin, risk limits');
  await test('hedge-mode account: positionSide on entry and stop; one-way account: none', async () => {
    const h = await fakeBinance({ hedge: true }); const ch = new BinanceFutures('testnet', 'k', SECRET, h.url);
    await ch.openWithStop('BTCUSDT', 'BUY', 0.01, 59000);
    assert.equal(h.posts()[0].params.positionSide, 'LONG'); assert.equal(h.posts()[1].params.positionSide, 'LONG');
    await ch.openWithStop('ETHUSDT', 'SELL', 0.1, 3100);
    assert.equal(h.posts()[2].params.positionSide, 'SHORT');
    h.close();
    const o = await fakeBinance({}); const co = new BinanceFutures('testnet', 'k', SECRET, o.url);
    await co.openWithStop('BTCUSDT', 'BUY', 0.01, 59000);
    assert.equal(o.posts()[0].params.positionSide, undefined); assert.equal(o.posts()[1].params.positionSide, undefined);
    o.close();
  });
  await test('hedge mode: failed stop closes WITHOUT reduceOnly and ignores the other side (no false alarm)', async () => {
    const f = await fakeBinance({ hedge: true, stopFails: true, seed: { 'BTCUSDT|SHORT': -0.5 } }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), (e: Error) => !(e instanceof UnprotectedPositionError) && /ยืนยันจาก positionRisk/.test(e.message));
    const close = f.posts().find((p) => p.params.positionSide === 'LONG' && p.params.side === 'SELL' && p.path === '/fapi/v1/order')!;
    assert.ok(close && close.params.reduceOnly === undefined);
    assert.equal(f.positions['BTCUSDT|SHORT'], -0.5, 'the other side is untouched');
    f.close();
  });
  await test('hedge mode: stop and close both fail -> still UnprotectedPositionError', async () => {
    const f = await fakeBinance({ hedge: true, stopFails: true, closeFails: true }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await assert.rejects(() => c.openWithStop('BTCUSDT', 'BUY', 0.01, 59000), UnprotectedPositionError);
    f.close();
  });
  await test('preflight applies margin type (tolerating "already set") and leverage', async () => {
    const f = await fakeBinance({ marginSame: true }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url);
    await c.preflight('BTCUSDT', 100, { leverage: 5, marginType: 'ISOLATED' });
    const paths = f.log.map((l) => l.path);
    assert.ok(paths.includes('/fapi/v1/marginType') && paths.includes('/fapi/v1/leverage'));
    assert.equal(f.log.find((l) => l.path === '/fapi/v1/leverage')!.params.leverage, '5');
    f.close();
  });
  await test('total exposure cap blocks BEFORE anything is changed or sent', async () => {
    const f = await fakeBinance({ seed: { BTCUSDT: 0.1 } }); const c = new BinanceFutures('testnet', 'k', SECRET, f.url); // 0.1 BTC * 60000 = 6000 already open
    await assert.rejects(() => c.preflight('ETHUSDT', 5000, { maxTotalNotionalUsd: 10_000, leverage: 10 }), (e: Error) => e instanceof RiskLimitError && /เกินเพดาน/.test(e.message));
    await c.preflight('ETHUSDT', 3000, { maxTotalNotionalUsd: 10_000 }); // 9000 <= 10000
    assert.ok(!f.log.some((l) => l.path === '/fapi/v1/leverage'), 'leverage must not be touched when blocked');
    f.close();
  });
  await test('daily loss cap counts realized PnL + fees + funding only (not transfers)', async () => {
    const mk = (income: Array<{ incomeType: string; income: string }>) => fakeBinance({ income });
    const a = await mk([{ incomeType: 'REALIZED_PNL', income: '-40' }, { incomeType: 'COMMISSION', income: '-8' }, { incomeType: 'FUNDING_FEE', income: '-5' }, { incomeType: 'TRANSFER', income: '1000' }]);
    await assert.rejects(() => new BinanceFutures('testnet', 'k', SECRET, a.url).preflight('BTCUSDT', 10, { maxDailyLossUsd: 50 }), /เพดานขาดทุนรายวัน/); // -53 <= -50
    a.close();
    const b = await mk([{ incomeType: 'REALIZED_PNL', income: '-40' }, { incomeType: 'TRANSFER', income: '-500' }]);
    await new BinanceFutures('testnet', 'k', SECRET, b.url).preflight('BTCUSDT', 10, { maxDailyLossUsd: 50 }); // -40 > -50, transfer ignored
    b.close();
  });

  console.log('\nOrderGuard');
  await test('one at a time, no repeats within the cooldown, audit trail written', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qt-')), 'a.jsonl');
    let t = 1_000_000;
    const g = new OrderGuard({ cooldownMs: 30_000, auditFile: file, now: () => t });
    let release!: () => void;
    const first = g.run('BTCUSDT:BUY', { symbol: 'BTCUSDT' }, true, () => new Promise<string>((r) => { release = () => r('done'); }));
    await assert.rejects(() => g.run('ETHUSDT:BUY', { symbol: 'ETHUSDT' }, true, async () => 'x'), (e: any) => e instanceof GuardError && e.status === 429);
    release(); assert.equal(await first, 'done');
    t += 5_000;
    await assert.rejects(() => g.run('BTCUSDT:BUY', { symbol: 'BTCUSDT' }, true, async () => 'x'), /กันส่งซ้ำ/);
    assert.equal(await g.run('BTCUSDT:BUY', { symbol: 'BTCUSDT' }, false, async () => 'dry'), 'dry'); // cooldown off (dry-run)
    t += 60_000;
    assert.equal(await g.run('BTCUSDT:BUY', { symbol: 'BTCUSDT' }, true, async () => 'again'), 'again');
    await assert.rejects(() => g.run('ETHUSDT:SELL', { symbol: 'ETHUSDT' }, true, async () => { throw new UnprotectedPositionError('x'); }), UnprotectedPositionError);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.stage === 'rejected' && l.reason === 'busy') && lines.some((l) => l.reason === 'duplicate'));
    assert.ok(lines.some((l) => l.stage === 'result' && l.ok === false && l.unprotected === true));
    assert.ok(lines.every((l) => typeof l.ts === 'string'));
  });

  console.log('\nworker/index.ts end-to-end (spawned process, fake exchange)');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const run = async (envOver: Record<string, string>, fakeUrl: string) => {
    const port = 4800 + Math.floor(Math.random() * 150);
    const audit = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qt-w-')), 'audit.jsonl');
    const env = { ...process.env, WORKER_TOKEN: 'x'.repeat(32), WORKER_HOST: '127.0.0.1', WORKER_PORT: String(port), BINANCE_ENV: 'testnet', BINANCE_API_KEY: 'k', BINANCE_API_SECRET: SECRET,
      BINANCE_FUTURES_BASE_URL: fakeUrl, SYMBOLS: 'BTCUSDT,ETHUSDT', MAX_NOTIONAL_USD: '1000', ORDER_AUDIT_FILE: audit, ORDER_COOLDOWN_SEC: '30', PHASE1_ENABLED: 'false', ...envOver };
    const child = spawn(process.execPath, ['--import', 'tsx', 'worker/index.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const exited = new Promise<number | null>((r) => child.on('exit', (c) => r(c)));
    for (let i = 0; i < 100 && !/listening/.test(out); i++) { if (child.exitCode !== null) break; await new Promise((r) => setTimeout(r, 100)); }
    const url = `http://127.0.0.1:${port}`;
    const post = async (p: string, body: unknown, auth = true) => { const r = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${'x'.repeat(32)}` } : {}) }, body: JSON.stringify(body) }); return { code: r.status, body: await r.json() as any }; };
    return { child, exited, out: () => out, post, audit: () => (fs.existsSync(audit) ? fs.readFileSync(audit, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []), stop: () => { child.kill(); } };
  };
  await test('dry-run: validates and rounds, sends nothing, audits; auth and allowlist enforced', async () => {
    const f = await fakeBinance(); const w = await run({ DRY_RUN: 'true' }, f.url);
    try {
      const r = await w.post('/order', { symbol: 'btcusdt', side: 'BUY', quantity: 0.0129, stopPrice: 59000.77 });
      assert.equal(r.code, 200); assert.equal(r.body.dryRun, true); assert.equal(r.body.plan.qty, 0.012); assert.equal(r.body.plan.stop, 59000.7);
      assert.equal(f.posts().length, 0);
      assert.equal((await w.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01, stopPrice: 59000 }, false)).code, 401);
      assert.equal((await w.post('/order', { symbol: 'DOGEUSDT', side: 'BUY', quantity: 1, stopPrice: 1 })).code, 400);
      assert.equal((await w.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01 })).code, 400);
      assert.ok(w.audit().some((l) => l.stage === 'dry-run'));
    } finally { w.stop(); f.close(); }
  });
  await test('live-path (testnet): order placed, immediate duplicate refused with 429, audit has attempt+result', async () => {
    const f = await fakeBinance(); const w = await run({ DRY_RUN: 'false' }, f.url);
    try {
      const a = await w.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01, stopPrice: 59000 });
      assert.equal(a.code, 200); assert.equal(a.body.ok, true);
      const b = await w.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01, stopPrice: 59000 });
      assert.equal(b.code, 429); assert.equal(f.posts().filter((p) => p.path === '/fapi/v1/order').length, 1);
      const stages = w.audit().map((l) => l.stage);
      assert.ok(stages.includes('attempt') && stages.includes('result') && stages.includes('rejected'));
    } finally { w.stop(); f.close(); }
  });
  await test('an unprotected position comes back as HTTP 500 with unprotected:true and is logged loudly', async () => {
    const f = await fakeBinance({ stopFails: true, closeFails: true }); const w = await run({ DRY_RUN: 'false' }, f.url);
    try {
      const r = await w.post('/order', { symbol: 'ETHUSDT', side: 'SELL', quantity: 0.1, stopPrice: 3100 });
      assert.equal(r.code, 500); assert.equal(r.body.unprotected, true);
      assert.ok(/🚨/.test(w.out()));
    } finally { w.stop(); f.close(); }
  });
  await test('worker env: LEVERAGE/MARGIN_TYPE are applied before the order; daily-loss cap answers 403 with nothing sent', async () => {
    const f = await fakeBinance(); const w = await run({ DRY_RUN: 'false', LEVERAGE: '3', MARGIN_TYPE: 'isolated', MAX_TOTAL_NOTIONAL_USD: '100000' }, f.url);
    try {
      const r = await w.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01, stopPrice: 59000 });
      assert.equal(r.code, 200);
      const order = f.log.findIndex((l) => l.path === '/fapi/v1/order' && l.method === 'POST'), lev = f.log.findIndex((l) => l.path === '/fapi/v1/leverage'), mt = f.log.findIndex((l) => l.path === '/fapi/v1/marginType');
      assert.ok(lev >= 0 && mt >= 0 && lev < order && mt < order, 'settings come before the order');
      assert.equal(f.log.find((l) => l.path === '/fapi/v1/marginType')!.params.marginType, 'ISOLATED');
    } finally { w.stop(); f.close(); }
    const g = await fakeBinance({ income: [{ incomeType: 'REALIZED_PNL', income: '-80' }] }); const w2 = await run({ DRY_RUN: 'false', MAX_DAILY_LOSS_USD: '50' }, g.url);
    try {
      const r = await w2.post('/order', { symbol: 'BTCUSDT', side: 'BUY', quantity: 0.01, stopPrice: 59000 });
      assert.equal(r.code, 403); assert.match(r.body.message, /เพดานขาดทุนรายวัน/);
      assert.equal(g.posts().length, 0, 'no order may be sent');
    } finally { w2.stop(); g.close(); }
  });
  await test('invalid LEVERAGE / MARGIN_TYPE stop the worker at startup with a clear message', async () => {
    const f = await fakeBinance();
    for (const bad of [{ LEVERAGE: '0' }, { LEVERAGE: 'abc' }, { LEVERAGE: '2.5' }, { MARGIN_TYPE: 'FULL' }, { MAX_DAILY_LOSS_USD: '-5' }]) {
      const w = await run({ DRY_RUN: 'true', ...bad }, f.url);
      assert.notEqual(await w.exited, 0, JSON.stringify(bad)); assert.match(w.out(), /LEVERAGE|MARGIN_TYPE|MAX_DAILY_LOSS_USD/);
    }
    f.close();
  });
  await test('startup guards still hold: live needs ALLOW_LIVE; short token refused; busy port gives a clear message', async () => {
    const f = await fakeBinance();
    const live = await run({ BINANCE_ENV: 'live' }, f.url);
    assert.notEqual(await live.exited, 0); assert.match(live.out(), /ALLOW_LIVE/);
    const short = await run({ WORKER_TOKEN: 'short' }, f.url);
    assert.notEqual(await short.exited, 0); assert.match(short.out(), /24/);
    const a = await run({ DRY_RUN: 'true', WORKER_PORT: '4999' }, f.url);
    const b = await run({ DRY_RUN: 'true', WORKER_PORT: '4999' }, f.url);
    try { assert.notEqual(await b.exited, 0); assert.match(b.out(), /ถูกใช้อยู่/); } finally { a.stop(); b.stop(); f.close(); }
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
