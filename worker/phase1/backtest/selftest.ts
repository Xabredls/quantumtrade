/**
 * Offline self-test for the backtest toolkit (fake servers on localhost, synthetic data — no internet needed).
 * Run from the repo root:  npx tsx worker/phase1/backtest/selftest.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { handlePhase1 } from '../api.ts';
import { loadConfig } from '../config.ts';
import { pnlUsd } from '../paper.ts';
import type { Candle } from '../types.ts';
import { randomEntryBenchmark } from './benchmark.ts';
import { downloadBinance } from './binance-history.ts';
import { aggregate, appendBars, cachePath, cleanBars, intervalMs, lastOpenTime, readBars } from './data.ts';
import { decodeCandleFile, decodeTickFile, detectDivisor, downloadForex, inferCandleLayout, ticksToBars } from './dukascopy.ts';
import { FIXTURES } from './fixtures.ts';
import { lzmaDecode } from './lzma.ts';
import { listReports, readLatestReport, simConfigFor } from './report.ts';
import { simulate } from './sim.ts';
import type { SimConfig, Trade } from './sim.ts';
import { bootstrapMeanR, mulberry32, summarize } from './stats.ts';
import { main as cli } from './run.ts';

let passed = 0, failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${(e as Error).message.split('\n').slice(0, 5).join('\n     ')}`); }
}
const listen = (handler: http.RequestListener) => new Promise<{ url: string; close: () => void }>((resolve) => {
  const srv = http.createServer(handler).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
});
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const MS15 = 900_000, DAY = 86_400_000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qt-bt-'));

/** Random-walk bars on the 15m grid. `drift` is per-bar return. */
function walk(n: number, drift: number, noise: number, seed: number, start = Date.UTC(2023, 0, 2), price0 = 100): Candle[] {
  const r = mulberry32(seed); let p = price0; const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = o * (1 + drift + (r() - 0.5) * 2 * noise);
    const t = start + i * MS15;
    out.push({ openTime: t, open: o, high: Math.max(o, c) * (1 + r() * noise * 0.3), low: Math.min(o, c) * (1 - r() * noise * 0.3), close: c, volume: 1, closeTime: t + MS15 - 1 });
    p = c;
  }
  return out;
}
/** Returns with positive autocorrelation (phi): momentum entries genuinely have an edge here; phi=0 is pure noise. */
function momentum(n: number, phi: number, seed: number, start = Date.UTC(2023, 0, 2)): Candle[] {
  const r = mulberry32(seed); const gauss = () => { let x = 0; for (let i = 0; i < 6; i++) x += r(); return (x - 3) / 0.7071; };
  let p = 100, prev = 0; const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const ret = phi * prev + 0.002 * gauss(); prev = ret;
    const o = p, c = o * (1 + ret), t = start + i * MS15;
    out.push({ openTime: t, open: o, high: Math.max(o, c) * (1 + r() * 0.0005), low: Math.min(o, c) * (1 - r() * 0.0005), close: c, volume: 1, closeTime: t + MS15 - 1 });
    p = c;
  }
  return out;
}
/** (kept for reference) alternating chop and trend regimes. */
function regimes(n: number, seed: number, start = Date.UTC(2023, 0, 2)): Candle[] {
  const r = mulberry32(seed); let p = 100; const out: Candle[] = []; let left = 0, drift = 0, noise = 0.003;
  for (let i = 0; i < n; i++) {
    if (left <= 0) { const k = r(); left = 120 + Math.floor(r() * 120); if (k < 0.5) { drift = 0; noise = 0.002; } else { drift = (k < 0.75 ? 1 : -1) * 0.0018; noise = 0.0015; } }
    left--;
    const o = p, c = o * (1 + drift + (r() - 0.5) * 2 * noise); const t = start + i * MS15;
    out.push({ openTime: t, open: o, high: Math.max(o, c) * (1 + r() * 0.0006), low: Math.min(o, c) * (1 - r() * 0.0006), close: c, volume: 1, closeTime: t + MS15 - 1 });
    p = c;
  }
  return out;
}
const baseCfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  bot: 'futures', barMs: MS15, confirmCandles: 3, minTechScore: 0.65, slAtrMult: 1.5, tpAtrMult: 2.25, maxHoldHours: 24, sizeUsd: 20, feePct: 0.05, slipPct: 0.02,
  maxOpenPerBot: 20, maxOpenPerSide: 12, maxOrdersPerSymbol: 3, entryCooldownMin: 15, breakerLosses: 3, breakerPauseMin: 120, ...over,
});
const maxOverlap = (trades: Trade[]) => {
  const ev: Array<[number, number]> = [];
  for (const t of trades) { ev.push([t.entryTime, 1], [t.exitTime + 1, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, mx = 0; for (const [, d] of ev) { cur += d; mx = Math.max(mx, cur); } return mx;
};

let e2eDir = '';
async function main() {
  console.log('\nLZMA decoder (vs files made by Python)');
  await test('decodes Dukascopy-style candle and tick files', () => {
    assert.equal(lzmaDecode(b64(FIXTURES.eurCandles)).length, 180 * 24);
    assert.equal(lzmaDecode(b64(FIXTURES.eurTicks)).length, 400 * 20);
    assert.throws(() => lzmaDecode(new Uint8Array([1, 2, 3])), /short|LZMA/);
    const bad = b64(FIXTURES.eurCandles); bad[40] ^= 0xff; bad[41] ^= 0xff;
    let threw = false; try { const out = lzmaDecode(bad); threw = out.length !== 180 * 24 || true; } catch { threw = true; }
    assert.ok(threw);
  });

  console.log('\nDukascopy decoding');
  await test('price divisor from plausibility (EURUSD / USDJPY / gold)', () => {
    assert.equal(detectDivisor('EURUSD', 108500), 100000);
    assert.equal(detectDivisor('USDJPY', 150123), 1000);
    assert.equal(detectDivisor('XAUUSD', 2300123), 1000);
    assert.throws(() => detectDivisor('EURUSD', 5e9), /ตัวหาร/);
  });
  await test('candle layout is inferred from data (two different column orders)', () => {
    const day = Date.UTC(2024, 0, 10);
    const e = decodeCandleFile(b64(FIXTURES.eurCandles), day, 'EURUSD');
    const g = decodeCandleFile(b64(FIXTURES.goldCandles), day, 'XAUUSD');
    for (const [c, x] of [[e, FIXTURES.eurExpect], [g, FIXTURES.goldExpect]] as const) {
      assert.equal(c.length, x.n);
      assert.ok(Math.abs(c[0].open - x.firstOpen) < 1e-9, `first open ${c[0].open} vs ${x.firstOpen}`);
      assert.ok(Math.abs(c[c.length - 1].close - x.lastClose) < 1e-9);
      assert.ok(Math.abs(Math.min(...c.map((k) => k.low)) - x.minLow) < 1e-9);
      assert.ok(Math.abs(Math.max(...c.map((k) => k.high)) - x.maxHigh) < 1e-9);
    }
    assert.equal(e[1].openTime, day + 60_000);
    assert.ok(inferCandleLayout([[0, 5, 6, 4, 7], [60, 6, 5, 4, 8], [120, 5, 7, 5, 8]]).high >= 0);
  });
  await test('tick files -> bars', () => {
    const t = decodeTickFile(b64(FIXTURES.eurTicks), Date.UTC(2024, 0, 10, 12), 'EURUSD');
    const x = FIXTURES.tickExpect;
    assert.equal(t.length, x.n);
    assert.ok(Math.abs(t[0].bid - x.firstBid) < 1e-9 && Math.abs(t[t.length - 1].bid - x.lastBid) < 1e-9);
    const bars = ticksToBars(t, MS15);
    assert.ok(Math.abs(Math.max(...bars.map((b) => b.high)) - x.maxBid) < 1e-9);
    assert.ok(Math.abs(Math.min(...bars.map((b) => b.low)) - x.minBid) < 1e-9);
  });

  console.log('\nData utilities');
  await test('aggregate 1m -> 15m, cache round-trip, cleaning', () => {
    const one: Candle[] = Array.from({ length: 45 }, (_, i) => ({ openTime: i * 60_000, open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i, volume: 1, closeTime: i * 60_000 + 59_999 }));
    const a = aggregate(one, MS15);
    assert.equal(a.length, 3);
    assert.deepEqual([a[0].open, a[0].close, a[0].high, a[0].low, a[0].volume], [10, 25, 26, 9, 15]);
    const f = path.join(tmp(), 'x.bin');
    appendBars(f, a.slice(0, 2)); appendBars(f, a.slice(2));
    assert.deepEqual(readBars(f, MS15), a);
    assert.equal(lastOpenTime(f), a[2].openTime);
    const dirty = [...a, { ...a[2], openTime: a[2].openTime - 1 }, { ...a[0], openTime: 9e12, high: 1, low: 5 }, { ...a[0], openTime: 9.1e12, open: NaN }];
    const c = cleanBars(dirty, MS15);
    assert.equal(c.bars.length, 3); assert.equal(c.quality.removed, 3);
    assert.equal(intervalMs('4h'), 4 * 3_600_000);
  });

  console.log('\nHistory downloads (fake servers)');
  await test('Binance: pages, drops the forming candle, resumes without duplicates, handles 451 / bad symbol', async () => {
    const now0 = Date.UTC(2024, 0, 1);
    let total = 2500;
    const all = (n: number) => Array.from({ length: n }, (_, i) => { const t = now0 - 3000 * MS15 + i * MS15; return [t, '10', '11', '9', '10.5', '5', t + MS15 - 1, '0', 0, '0', '0', '0']; });
    let calls = 0;
    const srv = await listen((req, res) => {
      const u = new URL(req.url!, 'http://x'); calls++;
      if (u.searchParams.get('symbol') === 'GEO') { res.writeHead(451); return res.end('Service unavailable from a restricted location'); }
      if (u.searchParams.get('symbol') === 'NOPE') { res.writeHead(400); return res.end('{"code":-1121,"msg":"Invalid symbol."}'); }
      const st = Number(u.searchParams.get('startTime')), lim = Number(u.searchParams.get('limit'));
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-mbx-used-weight-1m': '10' });
      res.end(JSON.stringify(all(total).filter((k) => (k[0] as number) >= st).slice(0, lim)));
    });
    const dir = tmp();
    const now = () => now0 - 3000 * MS15 + 2499 * MS15 + 1000; // the last of 2500 candles is still forming
    const r1 = await downloadBinance({ venue: 'spot', symbol: 'AAA', interval: '15m', from: 0, dataDir: dir, baseUrl: srv.url, now });
    assert.equal(r1.added, 2499); assert.ok(calls >= 3);
    total = 2800;
    const now2 = () => now0 - 3000 * MS15 + 2799 * MS15 + 1000;
    const r2 = await downloadBinance({ venue: 'spot', symbol: 'AAA', interval: '15m', from: 0, dataDir: dir, baseUrl: srv.url, now: now2 });
    assert.equal(r2.added, 300); assert.equal(r2.total, 2799);
    const bars = readBars(cachePath(dir, 'spot', 'AAA', '15m'), MS15);
    assert.ok(bars.every((b, i) => i === 0 || b.openTime - bars[i - 1].openTime === MS15), 'no gaps or duplicates');
    await assert.rejects(() => downloadBinance({ venue: 'futures', symbol: 'GEO', interval: '15m', from: 0, dataDir: dir, baseUrl: srv.url }), /451|ตำแหน่ง/);
    await assert.rejects(() => downloadBinance({ venue: 'spot', symbol: 'NOPE', interval: '15m', from: 0, dataDir: dir, baseUrl: srv.url }), /ไม่มีสัญลักษณ์/);
    srv.close();
  });
  await test('Dukascopy: daily-candle route, weekend skipping, resume adds nothing', async () => {
    const now = Date.UTC(2024, 0, 24, 12);
    const hits: string[] = [];
    const srv = await listen((req, res) => {
      hits.push(req.url!);
      const m = /\/(\w+)\/(\d{4})\/(\d{2})\/(\d{2})\/BID_candles_min_1\.bi5/.exec(req.url!);
      if (!m) { res.writeHead(404); return res.end(); }
      const dow = new Date(Date.UTC(+m[2], +m[3], +m[4])).getUTCDay();
      if (dow === 0 || dow === 6) { res.writeHead(404); return res.end(); }
      res.writeHead(200); res.end(Buffer.from(b64(m[1] === 'XAUUSD' ? FIXTURES.goldCandles : FIXTURES.eurCandles)));
    });
    const dir = tmp();
    const r = await downloadForex('EURUSD', Date.UTC(2024, 0, 8), { dataDir: dir, interval: '15m', baseUrl: srv.url, now: () => now });
    assert.equal(r.mode, 'candles'); assert.equal(r.added, 12 * 12);
    assert.ok(!hits.some((h) => /\/2024\/00\/(13|20)\//.test(h)), 'Saturdays are not requested');
    const bars = readBars(r.file, MS15);
    assert.ok(bars.every((b, i) => i === 0 || b.openTime > bars[i - 1].openTime));
    const r2 = await downloadForex('EURUSD', Date.UTC(2024, 0, 8), { dataDir: dir, interval: '15m', baseUrl: srv.url, now: () => now });
    assert.equal(r2.added, 0);
    const g = await downloadForex('XAUUSD', Date.UTC(2024, 0, 8), { dataDir: dir, interval: '15m', baseUrl: srv.url, now: () => now });
    assert.ok(readBars(g.file, MS15).every((b) => b.close > 2000 && b.close < 2400), 'gold prices scaled correctly');
    srv.close();
  });
  await test('Dukascopy: falls back to hourly ticks when daily candles are unavailable', async () => {
    const now = Date.UTC(2024, 0, 24, 12);
    const srv = await listen((req, res) => {
      const m = /\/(\d{4})\/(\d{2})\/(\d{2})\/12h_ticks\.bi5/.exec(req.url!);
      const dow = m ? new Date(Date.UTC(+m[1], +m[2], +m[3])).getUTCDay() : 0;
      if (!m || dow === 0 || dow === 6) { res.writeHead(404); return res.end(); }
      res.writeHead(200); res.end(Buffer.from(b64(FIXTURES.eurTicks)));
    });
    const r = await downloadForex('EURUSD', Date.UTC(2024, 0, 22), { dataDir: tmp(), interval: '15m', baseUrl: srv.url, now: () => now, concurrency: 4 });
    assert.equal(r.mode, 'ticks'); assert.ok(r.added > 0);
    srv.close();
  });
  await test('Dukascopy: clear error when nothing is reachable', async () => {
    const srv = await listen((_q, res) => { res.writeHead(404); res.end(); });
    await assert.rejects(() => downloadForex('EURUSD', Date.UTC(2024, 0, 8), { dataDir: tmp(), interval: '15m', baseUrl: srv.url, now: () => Date.UTC(2024, 0, 24) }), /ไม่พบข้อมูล/);
    srv.close();
  });

  console.log('\nSimulator');
  const up = (seed: number) => walk(1500, 0.0006, 0.003, seed);
  await test('entry is at the NEXT bar open, never the signal bar (no look-ahead by construction)', () => {
    const r = simulate(new Map([['A', walk(2500, 0.0004, 0.004, 3)], ['B', walk(2500, -0.0004, 0.004, 4)]]), baseCfg());
    assert.ok(r.trades.length > 5, `expected trades, got ${r.trades.length}`);
    for (const t of r.trades) { assert.equal(t.entryTime, t.decidedAt + 1); assert.ok(t.exitTime >= t.entryTime); }
  });
  await test('NO LOOK-AHEAD: rewriting the future never changes any earlier DECISION (checked at several cut points)', () => {
    const base = [0, 1, 2].map((k) => walk(2400, 0.0003 * (k - 1), 0.004, 10 + k));
    const decisions = (x: Trade[], upTo: number) => x.filter((t) => t.decidedAt <= upTo).map((t) => `${t.symbol}|${t.side}|${t.decidedAt}`).sort();
    let compared = 0;
    for (const K of [900, 1200, 1500, 1800]) {
      const cut = (tailSeed: number) => new Map(base.map((a, k) => {
        // the future from bar K on is replaced by violent, unrelated candles
        const tail = walk(2400 - K, -0.002 * (k - 1), 0.02, tailSeed + k, a[K].openTime, a[K - 1].close);
        return [`S${k}`, [...a.slice(0, K), ...tail]] as [string, Candle[]];
      }));
      const A = simulate(cut(100), baseCfg()), B = simulate(cut(200), baseCfg());
      const limit = base[0][K - 1].closeTime; // last decision that is allowed to depend only on bars < K
      const da = decisions(A.trades, limit), db = decisions(B.trades, limit);
      assert.deepEqual(da, db, `cut ${K}: decisions changed when only the FUTURE changed`);
      compared += da.length;
    }
    assert.ok(compared >= 20, `test must compare real decisions (compared ${compared})`);
  });
  await test('exit order is stop-first inside the backtest too (shared rule)', async () => {
    const { exitCheck } = await import('../paper.ts');
    const c: Candle = { openTime: 0, open: 100, high: 103, low: 98, close: 100, volume: 1, closeTime: 1 };
    assert.equal(exitCheck({ side: 'BUY', sl: 99, tp: 102 }, c, 0)!.outcome, 'sl');
    assert.equal(exitCheck({ side: 'SELL', sl: 101, tp: 98.5 }, c, 0)!.outcome, 'sl');
  });
  await test('portfolio caps hold: never more than 12 same-side or 20 total open at once', () => {
    const same = walk(2500, 0.0005, 0.003, 21);
    const data = new Map(Array.from({ length: 30 }, (_, i) => [`S${String(i).padStart(2, '0')}`, same] as [string, Candle[]]));
    const r = simulate(data, baseCfg());
    assert.ok(r.trades.length > 10);
    assert.ok(maxOverlap(r.trades) <= 12, `max overlap ${maxOverlap(r.trades)}`);
    assert.ok((r.skipped.max_open_side ?? 0) > 0);
  });
  await test('spot is long-only', () => {
    const r = simulate(new Map([['D', walk(3000, -0.0006, 0.003, 31)]]), baseCfg({ bot: 'spot' }));
    assert.equal(r.trades.filter((t) => t.side === 'SELL').length, 0);
    assert.ok((r.skipped.spot_long_only ?? 0) > 0);
  });
  await test('money identities: pnl = shared pnl function, R has the sign of pnl, costs only hurt', () => {
    const data = new Map([['A', walk(3000, 0.0004, 0.004, 41)], ['B', walk(3000, -0.0003, 0.004, 42)]]);
    const withCosts = simulate(data, baseCfg()), free = simulate(data, baseCfg({ feePct: 0, slipPct: 0 }));
    for (const t of withCosts.trades) {
      assert.ok(Math.abs(t.pnlUsd - pnlUsd(t.side, t.entry, t.exit, t.sizeUsd, 0.05)) < 1e-9);
      assert.ok(t.r === 0 || Math.sign(t.r) === Math.sign(t.pnlUsd));
    }
    const avg = (x: Trade[]) => x.reduce((a, t) => a + t.r, 0) / x.length;
    assert.ok(free.trades.length > 10 && avg(free.trades) > avg(withCosts.trades));
  });
  await test('deterministic', () => {
    const data = new Map([['A', walk(2500, 0.0004, 0.004, 51)]]);
    assert.deepEqual(simulate(data, baseCfg()).trades, simulate(data, baseCfg()).trades);
  });
  await test('circuit breaker pauses entries after 3 straight losses', () => {
    const data = new Map([['A', walk(5000, 0, 0.006, 61)], ['B', walk(5000, 0, 0.006, 62)], ['C', walk(5000, 0, 0.006, 63)]]);
    const on = simulate(data, baseCfg({ breakerLosses: 2, breakerPauseMin: 600 })), off = simulate(data, baseCfg({ breakerLosses: 999 }));
    assert.ok((on.skipped.circuit_breaker ?? 0) > 0 && on.trades.length < off.trades.length);
  });

  console.log('\nStatistics');
  await test('summary numbers on a known trade list', () => {
    const mkT = (pnl: number, r: number, exit: number): Trade => ({ symbol: 'X', side: 'BUY', decidedAt: 0, entryTime: exit - MS15, entry: 1, exitTime: exit, exit: 1, outcome: pnl > 0 ? 'tp' : 'sl', pnlUsd: pnl, r, sizeUsd: 20, barsHeld: 4, techScore: 0.7 });
    const s = summarize([mkT(2, 1.5, 1), mkT(-1, -1, 2), mkT(-1, -1, 3), mkT(3, 2, 4), mkT(-1, -1, 5)], MS15);
    assert.equal(s.trades, 5); assert.equal(s.wins, 2); assert.ok(Math.abs(s.winRate! - 0.4) < 1e-12);
    assert.ok(Math.abs(s.profitFactor! - 5 / 3) < 1e-12); assert.ok(Math.abs(s.totalPnlUsd - 2) < 1e-12);
    assert.equal(s.longestLossStreak, 2); assert.ok(Math.abs(s.maxDrawdownUsd - 2) < 1e-12); assert.equal(s.avgHoldHours, 1);
    assert.ok(Math.abs(s.expectancyR! - 0.1) < 1e-12);
  });
  await test('day-block bootstrap: deterministic, contains the mean, wider than naive for clustered days', () => {
    const trades: Trade[] = [];
    for (let d = 0; d < 40; d++) { const common = d % 2 ? 1.5 : -1.5; for (let k = 0; k < 10; k++) trades.push({ symbol: 'X', side: 'BUY', decidedAt: 0, entryTime: d * DAY + k * 1000, entry: 1, exitTime: d * DAY + k * 1000 + 5, exit: 1, outcome: 'tp', pnlUsd: 0, r: common + (k % 2 ? 0.1 : -0.1), sizeUsd: 20, barsHeld: 1, techScore: 0.7 }); }
    const a = bootstrapMeanR(trades, 500, 3), b = bootstrapMeanR(trades, 500, 3);
    assert.deepEqual(a, b);
    assert.ok(a.lo! <= a.mean! && a.mean! <= a.hi!);
    assert.ok(a.hi! - a.lo! > 0.4, 'day clustering must widen the interval');
  });
  await test('random-timing benchmark: detects real momentum, and shows NO edge on pure noise', () => {
    const cfg = baseCfg();
    const mom = new Map([['A', momentum(9000, 0.7, 5)], ['B', momentum(9000, 0.7, 6)]]);
    const mt = simulate(mom, cfg).trades;
    const mb = randomEntryBenchmark(mom, mt, cfg, 120, 3);
    assert.ok(mt.length >= 30, `trades ${mt.length}`);
    assert.ok(mb.random && mb.actualMeanR! > mb.random.mean, `real ${mb.actualMeanR} random ${mb.random?.mean}`);
    assert.ok(mb.pValue! < 0.05, `momentum edge should be significant, p=${mb.pValue}`);
    const noise = new Map([['A', momentum(9000, 0, 5)], ['B', momentum(9000, 0, 6)]]);
    const nb = randomEntryBenchmark(noise, simulate(noise, cfg).trades, cfg, 120, 3);
    assert.ok(nb.pValue! > 0.02, `noise looked significant: p=${nb.pValue}`);
  });
  await test('regression: on choppy markets this signal fires mostly in chop and does NOT beat random timing (found by the diagnosis)', () => {
    const cfg = baseCfg();
    const data = new Map([['A', regimes(9000, 5)]]);
    const t = simulate(data, cfg).trades;
    const b = randomEntryBenchmark(data, t, cfg, 120, 3);
    assert.ok(t.length > 100 && b.actualMeanR! <= b.random!.mean + 0.05, `real ${b.actualMeanR} vs random ${b.random!.mean}`);
  });

  console.log('\nEnd-to-end CLI (fake Binance)');
  await test('download -> run -> saved report + CSV, readable by the dashboard API', async () => {
    const start = Date.now() - 4000 * MS15 - 5 * DAY;
    const grid = (seed: number, drift: number) => walk(3600, drift, 0.004, seed, Math.floor(start / MS15) * MS15);
    const data: Record<string, Candle[]> = { AAAUSDT: grid(81, 0.0004), BBBUSDT: grid(82, -0.0002), CCCUSDT: grid(83, 0.0001) };
    const srv = await listen((req, res) => {
      const u = new URL(req.url!, 'http://x');
      const json = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/api/v3/exchangeInfo') return json({ symbols: Object.keys(data).map((s) => ({ symbol: s, baseAsset: s.slice(0, 3), quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true })) });
      if (u.pathname === '/api/v3/ticker/24hr') return json(Object.keys(data).map((s, i) => ({ symbol: s, quoteVolume: String(9e9 - i * 1e8) })));
      if (u.pathname === '/api/v3/klines') {
        const st = Number(u.searchParams.get('startTime')), lim = Number(u.searchParams.get('limit'));
        return json((data[u.searchParams.get('symbol')!] ?? []).filter((c) => c.openTime >= st).slice(0, lim).map((c) => [c.openTime, String(c.open), String(c.high), String(c.low), String(c.close), '1', c.closeTime, '0', 0, '0', '0', '0']));
      }
      res.writeHead(404); res.end();
    });
    const dir = tmp();
    const log = console.log; console.log = () => {};
    try {
      await cli(['download', '--market', 'spot', '--top', '3', '--dataDir', dir, '--baseUrl', srv.url]);
      await cli(['status', '--dataDir', dir]);
      await cli(['run', '--market', 'spot', '--dataDir', dir, '--size', '20']);
    } finally { console.log = log; }
    srv.close();
    e2eDir = dir;
    const rep = readLatestReport(dir, 'spot')!;
    assert.ok(rep && rep.summary.trades > 5, `trades ${rep?.summary.trades}`);
    assert.equal(rep.symbols.length, 3);
    assert.ok(rep.equity.length > 0 && rep.warnings.length >= 3 && rep.benchmark.iterations > 0);
    assert.ok(Object.keys(rep.byYear).length >= 1);
    assert.equal(listReports(dir).length, 1);
    const csv = fs.readFileSync(path.join(dir, 'backtests', rep.tradesFile!), 'utf8').trim().split('\n');
    assert.equal(csv.length - 1, rep.summary.trades);
    assert.equal(readLatestReport(dir, 'forex'), null);
    assert.equal(readLatestReport(dir, '../etc'), null);
  });
  await test('dashboard API serves the saved report, dataset status, and rejects bad markets', async () => {
    const srv = await listen((req, res) => { void handlePhase1(req, res, {} as any, { recentSignals() { return []; }, recentClosed() { return []; } }, e2eDir); });
    const get = async (p: string) => { const r = await fetch(srv.url + p); return { code: r.status, body: await r.json() as any }; };
    const latest = await get('/phase1/backtest/latest?market=spot');
    assert.equal(latest.code, 200); assert.ok(latest.body.report.summary.trades > 5 && Array.isArray(latest.body.report.warnings));
    assert.equal((await get('/phase1/backtest/latest?market=forex')).code, 404);
    assert.equal((await get('/phase1/backtest/latest?market=..%2F..%2Fetc')).code, 404);
    const data = await get('/phase1/backtest/data');
    assert.equal(data.body.datasets.spot.length, 3); assert.ok(data.body.datasets.spot[0].bars > 3000);
    assert.equal((await get('/phase1/backtest/list')).body.reports.length, 1);
    srv.close();
    const noDir = await listen((req, res) => { void handlePhase1(req, res, {} as any, {} as any); });
    assert.equal((await (await fetch(noDir.url + '/phase1/backtest/list')).status), 503);
    noDir.close();
  });
  await test('forex costs default to a non-zero spread model; crypto uses exchange fees', () => {
    const cfg = loadConfig({});
    assert.ok(simConfigFor('forex', '15m', 20, cfg).feePct > 0 && simConfigFor('forex', '15m', 20, cfg).slipPct > 0);
    assert.equal(simConfigFor('spot', '15m', 20, cfg).feePct, 0.1);
    assert.equal(simConfigFor('forex', '15m', 20, cfg, { BT_FOREX_FEE_PCT: '0.02' }).feePct, 0.02);
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
