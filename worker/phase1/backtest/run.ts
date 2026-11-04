/**
 * Backtest CLI (run from the repo root):
 *   npx tsx worker/phase1/backtest/run.ts status
 *   npx tsx worker/phase1/backtest/run.ts download --market futures --top 20
 *   npx tsx worker/phase1/backtest/run.ts download --market spot --top 20
 *   npx tsx worker/phase1/backtest/run.ts download --market forex            (EURUSD, GBPUSD, XAUUSD)
 *   npx tsx worker/phase1/backtest/run.ts run --market futures [--from 2021-01-01] [--to ...] [--size 20]
 * Options: --symbols A,B,C   --interval 15m   --from YYYY-MM-DD|max   --dataDir DIR   --baseUrl URL (mirror/testing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.ts';
import { downloadBinance, topSymbols } from './binance-history.ts';
import { cachePath, cleanBars, intervalMs, readBars, resolveDataDir } from './data.ts';
import type { Market } from './data.ts';
import { downloadForex } from './dukascopy.ts';
import { runBacktest, saveReport } from './report.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
try { (process as any).loadEnvFile?.(path.join(here, '..', '..', '.env')); } catch { /* no .env: defaults are fine */ }

function args(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'; }
  return o;
}
const DEFAULT_FOREX = ['EURUSD', 'GBPUSD', 'XAUUSD'];
const log = (m: string) => console.log(m);

function parseDate(s: string | undefined, market: Market): number | null {
  if (!s) return null;
  if (s === 'max') return market === 'forex' ? Date.UTC(2003, 4, 5) : 0;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error(`วันที่ไม่ถูกต้อง: ${s} (ใช้รูปแบบ YYYY-MM-DD)`);
  return t;
}

export async function main(argv: string[]) {
  const cmd = argv[0];
  const a = args(argv.slice(1));
  const dataDir = a.dataDir ?? resolveDataDir(process.env, path.join(here, '..', 'data'));
  const interval = a.interval ?? '15m';
  const market = a.market as Market | undefined;
  const baseUrl = a.baseUrl;

  if (cmd === 'status') {
    console.log(`โฟลเดอร์ข้อมูล: ${dataDir}`);
    for (const m of ['futures', 'spot', 'forex'] as const) {
      const dir = path.join(dataDir, 'history', m);
      if (!fs.existsSync(dir)) { console.log(`\n${m}: (ยังไม่มีข้อมูล)`); continue; }
      console.log(`\n${m}:`);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.bin')).sort()) {
        const [sym, iv] = f.replace('.bin', '').split('_');
        const bars = readBars(path.join(dir, f), intervalMs(iv));
        if (bars.length) console.log(`  ${sym.padEnd(10)} ${iv}  ${bars.length.toLocaleString().padStart(9)} แท่ง  ${new Date(bars[0].openTime).toISOString().slice(0, 10)} → ${new Date(bars[bars.length - 1].openTime).toISOString().slice(0, 10)}`);
      }
    }
    return;
  }
  if (!market || !['futures', 'spot', 'forex'].includes(market)) throw new Error('ต้องระบุ --market futures | spot | forex');

  if (cmd === 'download') {
    const from = parseDate(a.from ?? (market === 'forex' ? '2015-01-01' : 'max'), market)!;
    if (market === 'forex') {
      for (const s of (a.symbols ? a.symbols.split(',') : DEFAULT_FOREX)) {
        log(`\n▶ ${s}`);
        const r = await downloadForex(s.trim().toUpperCase(), from, { dataDir, interval, log, baseUrl });
        log(`   เสร็จ: เพิ่ม ${r.added.toLocaleString()} แท่ง`);
      }
    } else {
      const symbols = a.symbols ? a.symbols.split(',').map((s) => s.trim().toUpperCase()) : await topSymbols(market, Number(a.top ?? 20), baseUrl);
      log(`${market}: ${symbols.length} สัญลักษณ์ (${symbols.join(', ')})`);
      for (const s of symbols) {
        log(`\n▶ ${s}`);
        try { const r = await downloadBinance({ venue: market, symbol: s, interval, from, dataDir, log, baseUrl }); log(`   เสร็จ: เพิ่ม ${r.added.toLocaleString()} รวม ${r.total.toLocaleString()} แท่ง`); }
        catch (e) { log(`   ❌ ${s}: ${(e as Error).message}`); }
      }
    }
    log('\nดาวน์โหลดเสร็จ — รันต่อด้วย: npx tsx worker/phase1/backtest/run.ts run --market ' + market);
    return;
  }

  if (cmd === 'run') {
    const cfg = loadConfig({ ...process.env, DRY_RUN: 'true' });
    let symbols: string[];
    if (a.symbols) symbols = a.symbols.split(',').map((s) => s.trim().toUpperCase());
    else {
      const dir = path.join(dataDir, 'history', market);
      symbols = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(`_${interval}.bin`)).map((f) => f.split('_')[0]) : [];
      if (market !== 'forex') { // most liquid first: ties in the simulator go to the earlier symbol
        const sizes = new Map(symbols.map((s) => [s, fs.statSync(cachePath(dataDir, market, s, interval)).size]));
        symbols.sort((x, y) => (sizes.get(y) ?? 0) - (sizes.get(x) ?? 0));
      }
    }
    if (symbols.length === 0) throw new Error(`ไม่มีข้อมูลของตลาด ${market} — รัน download ก่อน`);
    const { report, trades } = runBacktest({ market, symbols, interval, fromMs: parseDate(a.from, market), toMs: parseDate(a.to, market), dataDir, sizeUsd: Number(a.size ?? 20), cfg, env: process.env, log });
    const { json, csv } = saveReport(dataDir, report, trades);
    printSummary(report);
    log(`\nบันทึกผล: ${json}\nรายการเทรดทั้งหมด (CSV): ${csv}\nดูบนแดชบอร์ด: แท็บ Backtest`);
    return;
  }
  throw new Error('คำสั่งไม่ถูกต้อง: ใช้ status | download | run');
}

function printSummary(r: ReturnType<typeof runBacktest>['report']) {
  const s = r.summary, f = (x: number | null, d = 2) => (x === null ? '-' : x.toFixed(d));
  console.log(`\n════════ ผล Backtest: ${r.market} ════════`);
  console.log(`เทรด ${s.trades} | ชนะ ${f(s.winRate === null ? null : s.winRate * 100, 1)}% | expectancy ${f(s.expectancyR, 3)} R/เทรด | profit factor ${f(s.profitFactor)} | PnL รวม ${f(s.totalPnlUsd)} USD (ไม้ละ ${r.params.sizeUsd}) | max drawdown ${f(s.maxDrawdownUsd)} USD`);
  console.log(`ช่วงเชื่อมั่น 95% ของ expectancy: ${f(r.bootstrap.lo, 3)} ถึง ${f(r.bootstrap.hi, 3)} R`);
  if (r.benchmark.random) console.log(`สุ่มจังหวะเข้า (${r.benchmark.iterations} รอบ): เฉลี่ย ${f(r.benchmark.random.mean, 3)} R (5–95%: ${f(r.benchmark.random.p5, 3)} ถึง ${f(r.benchmark.random.p95, 3)}) | กลยุทธ์จริง ${f(r.benchmark.actualMeanR, 3)} R | p = ${f(r.benchmark.pValue, 3)}`);
  console.log('\nรายปี:'); for (const [y, v] of Object.entries(r.byYear)) console.log(`  ${y}: ${String(v.n).padStart(5)} เทรด  win ${f(v.winRate === null ? null : v.winRate * 100, 0)}%  ${f(v.expectancyR, 3)} R  PnL ${f(v.pnlUsd)}`);
  console.log('\n⚠️  ข้อควรระวัง:'); for (const w of r.warnings) console.log(`  - ${w}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => { console.error(`\n❌ ${(e as Error).message}`); process.exit(1); });
}
