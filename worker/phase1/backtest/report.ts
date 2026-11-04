import fs from 'node:fs';
import path from 'node:path';
import type { Phase1Config } from '../config.ts';
import type { Candle } from '../types.ts';
import { randomEntryBenchmark } from './benchmark.ts';
import type { BenchmarkResult } from './benchmark.ts';
import { cachePath, cleanBars, intervalMs, readBars } from './data.ts';
import type { DataQuality, Market } from './data.ts';
import { simulate } from './sim.ts';
import type { SimConfig, Trade } from './sim.ts';
import { bootstrapMeanR, breakdown, equityCurve, quarterOf, summarize, yearOf } from './stats.ts';
import type { Interval, Slice, Summary } from './stats.ts';

export interface RunOpts {
  market: Market;
  symbols: string[];
  interval: string;
  fromMs: number | null;
  toMs: number | null;
  dataDir: string;
  sizeUsd: number;
  cfg: Phase1Config;
  env?: NodeJS.ProcessEnv;
  benchmarkIterations?: number;
  log?: (m: string) => void;
}

export interface BacktestReport {
  version: 1;
  market: Market;
  createdAt: number;
  params: Record<string, unknown>;
  symbols: string[];
  range: { from: number | null; to: number | null };
  dataQuality: Record<string, DataQuality>;
  summary: Summary;
  byYear: Record<string, Slice>;
  byQuarter: Record<string, Slice>;
  bySide: Record<string, Slice>;
  bySymbol: Record<string, Slice>;
  byHalf: Record<string, Slice>;
  signals: number;
  skipped: Record<string, number>;
  unfinished: number;
  equity: Array<{ t: number; pnl: number }>;
  bootstrap: Interval;
  benchmark: BenchmarkResult;
  reference: Record<string, { from: number; to: number; holdReturnPct: number }>;
  warnings: string[];
  tradesFile: string | null;
}

export function simConfigFor(market: Market, interval: string, sizeUsd: number, cfg: Phase1Config, env: NodeJS.ProcessEnv = {}): SimConfig {
  const num = (k: string, d: number) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  // Forex/gold has no exchange fee, but it has spread; model both as a small cost per side (conservative defaults).
  const feePct = market === 'forex' ? num('BT_FOREX_FEE_PCT', 0.005) : cfg.feePct[market];
  const slipPct = market === 'forex' ? num('BT_FOREX_SLIP_PCT', 0.005) : cfg.slipPct[market];
  return {
    bot: market, barMs: intervalMs(interval), confirmCandles: cfg.confirmCandles, minTechScore: cfg.minTechScore,
    slAtrMult: cfg.slAtrMult, tpAtrMult: cfg.tpAtrMult, maxHoldHours: cfg.maxHoldHours, sizeUsd, feePct, slipPct,
    maxOpenPerBot: cfg.maxOpenPerBot, maxOpenPerSide: cfg.maxOpenPerSide, maxOrdersPerSymbol: cfg.maxOrdersPerSymbol,
    entryCooldownMin: cfg.entryCooldownMin, breakerLosses: cfg.breakerLosses, breakerPauseMin: cfg.breakerPauseMin,
  };
}

export function loadDataset(o: Pick<RunOpts, 'market' | 'symbols' | 'interval' | 'fromMs' | 'toMs' | 'dataDir'>) {
  const barMs = intervalMs(o.interval);
  const data = new Map<string, Candle[]>();
  const quality: Record<string, DataQuality> = {};
  for (const s of o.symbols) {
    const raw = readBars(cachePath(o.dataDir, o.market, s, o.interval), barMs);
    const { bars, quality: q } = cleanBars(raw, barMs);
    const ranged = bars.filter((b) => (o.fromMs === null || b.openTime >= o.fromMs) && (o.toMs === null || b.openTime <= o.toMs));
    if (ranged.length === 0) continue;
    data.set(s, ranged);
    quality[s] = { ...q, bars: ranged.length, first: ranged[0].openTime, last: ranged[ranged.length - 1].openTime };
  }
  return { data, quality };
}

export function runBacktest(o: RunOpts): { report: BacktestReport; trades: Trade[] } {
  const log = o.log ?? (() => {});
  const { data, quality } = loadDataset(o);
  if (data.size === 0) throw new Error('ไม่พบข้อมูลที่ดาวน์โหลดไว้ — รันคำสั่ง download ก่อน (หรือเช็กชื่อสัญลักษณ์/ช่วงวันที่)');
  const missing = o.symbols.filter((s) => !data.has(s));
  const totalBars = [...data.values()].reduce((a, b) => a + b.length, 0);
  log(`โหลดข้อมูล ${data.size} สัญลักษณ์, ${totalBars.toLocaleString()} แท่ง${missing.length ? ` (ไม่มีข้อมูล: ${missing.join(', ')})` : ''}`);
  if (totalBars > 4_000_000) log('⚠️  ข้อมูลมาก (>4 ล้านแท่ง) ถ้าหน่วยความจำไม่พอ ให้เพิ่ม --from ให้สั้นลง หรือรันด้วย: node --max-old-space-size=6144 ...');

  const sc = simConfigFor(o.market, o.interval, o.sizeUsd, o.cfg, o.env);
  let lastPct = -1;
  const sim = simulate(data, sc, (p) => { const k = Math.floor(p * 10); if (k !== lastPct) { lastPct = k; log(`   จำลอง ${k * 10}%`); } });
  log(`จำลองเสร็จ: ${sim.trades.length.toLocaleString()} เทรด (สัญญาณ ${sim.signals.toLocaleString()})`);

  const trades = sim.trades;
  const summary = summarize(trades, sc.barMs);
  const mid = trades.length ? [...trades].sort((a, b) => a.entryTime - b.entryTime)[Math.floor(trades.length / 2)].entryTime : 0;
  const bench = randomEntryBenchmark(data, trades, sc, o.benchmarkIterations ?? 200);
  log(`ทดสอบเทียบกับการสุ่มจังหวะเข้า: ${bench.iterations} รอบ`);

  const reference: BacktestReport['reference'] = {};
  for (const [s, b] of data) reference[s] = { from: b[0].openTime, to: b[b.length - 1].openTime, holdReturnPct: (b[b.length - 1].close / b[0].open - 1) * 100 };

  const warnings = buildWarnings(o.market, summary, quality, missing, bench);
  const report: BacktestReport = {
    version: 1, market: o.market, createdAt: Date.now(),
    params: { interval: o.interval, sizeUsd: o.sizeUsd, feePctPerSide: sc.feePct, slippagePctPerSide: sc.slipPct, slAtrMult: sc.slAtrMult, tpAtrMult: sc.tpAtrMult, maxHoldHours: sc.maxHoldHours, confirmCandles: sc.confirmCandles, minTechScore: sc.minTechScore, maxOpenPerBot: sc.maxOpenPerBot, maxOpenPerSide: sc.maxOpenPerSide, maxOrdersPerSymbol: sc.maxOrdersPerSymbol, entryCooldownMin: sc.entryCooldownMin, breakerLosses: sc.breakerLosses, breakerPauseMin: sc.breakerPauseMin },
    symbols: [...data.keys()], range: { from: o.fromMs, to: o.toMs }, dataQuality: quality, summary,
    byYear: breakdown(trades, (t) => yearOf(t.entryTime)), byQuarter: breakdown(trades, (t) => quarterOf(t.entryTime)),
    bySide: breakdown(trades, (t) => t.side), bySymbol: breakdown(trades, (t) => t.symbol),
    byHalf: breakdown(trades, (t) => (t.entryTime < mid ? 'first-half' : 'second-half')),
    signals: sim.signals, skipped: sim.skipped, unfinished: sim.unfinished, equity: equityCurve(trades), bootstrap: bootstrapMeanR(trades), benchmark: bench,
    reference, warnings, tradesFile: null,
  };
  return { report, trades };
}

function buildWarnings(market: Market, s: Summary, quality: Record<string, DataQuality>, missing: string[], bench: BenchmarkResult): string[] {
  const w: string[] = [
    'ผลนี้คือ "กฎเทคนิคล้วน" (EMA/RSI/MACD + กติกาเข้า-ออกเดียวกับบอทจริง) ไม่รวมตัวกรอง Gemini เพราะการทดสอบ AI ย้อนหลังทำอย่างซื่อสัตย์ไม่ได้ (ผลไม่คงที่ และโมเดลอาจ "จำ" ข้อมูลอดีตได้) ส่วนของ AI วัดได้จากการรันสดเท่านั้น',
    'ไม่ได้ปรับพารามิเตอร์ให้เข้ากับข้อมูล (ไม่ optimise) จึงไม่มีการ overfit แต่ผลในอดีตก็ไม่ได้รับประกันอนาคต',
  ];
  if (market !== 'forex') w.push('รายชื่อสัญลักษณ์มักเป็นตัวที่ volume สูง "ในปัจจุบัน" เหรียญที่เคยดังแล้วถูกถอดหรือล้มหายไม่อยู่ในชุดนี้ (survivorship bias) ผลจึงอาจดีกว่าความเป็นจริง');
  if (market === 'futures') w.push('ไม่รวม funding fee ทุก 8 ชั่วโมง และไม่จำลองการถูก liquidate หรือ leverage');
  if (market === 'forex') w.push('ใช้ราคา BID ของ Dukascopy ค่าสเปรด/คอมมิชชันเป็นค่าประมาณ (ปรับได้ด้วย BT_FOREX_FEE_PCT / BT_FOREX_SLIP_PCT) ไม่ได้จำลองการขยายสเปรดช่วงข่าวแรงหรือช่วงตลาดปิด');
  if (s.trades < 30) w.push(`จำนวนเทรดมีเพียง ${s.trades} น้อยเกินกว่าจะสรุปอะไรได้`);
  else if (s.trades < 100) w.push(`จำนวนเทรด ${s.trades} ยังน้อย ตัวเลขคลาดเคลื่อนได้มาก`);
  const gappy = Object.entries(quality).filter(([, q]) => q.largestGapHours > 72 && q.gaps > 0).map(([k, q]) => `${k} (ช่องว่างสูงสุด ${q.largestGapHours} ชม.)`);
  if (gappy.length && market !== 'forex') w.push(`ข้อมูลบางตัวมีช่องว่างยาว: ${gappy.join(', ')}`);
  const removed = Object.entries(quality).filter(([, q]) => q.removed > 0).map(([k, q]) => `${k}: ${q.removed}`);
  if (removed.length) w.push(`ตัดแท่งเทียนที่ข้อมูลเสียออก: ${removed.join(', ')}`);
  if (missing.length) w.push(`ไม่มีข้อมูลของ: ${missing.join(', ')}`);
  if (bench.pValue !== null && bench.pValue > 0.1) w.push('ผลของกลยุทธ์ยังไม่ดีกว่าการสุ่มจังหวะเข้าอย่างมีนัยสำคัญ (ดูส่วนเทียบกับการสุ่ม) ยังไม่มีหลักฐานว่าสัญญาณเข้ามี edge');
  return w;
}

// ---- files ----------------------------------------------------------------------------------------------------
export function saveReport(dataDir: string, report: BacktestReport, trades: Trade[]): { json: string; csv: string } {
  const dir = path.join(dataDir, 'backtests');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(report.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `${report.market}-${stamp}`;
  const csv = path.join(dir, `${base}-trades.csv`);
  const head = 'symbol,side,decidedAt,entryTime,entry,exitTime,exit,outcome,pnlUsd,r,barsHeld,techScore\n';
  const rows = trades.map((t) => [t.symbol, t.side, new Date(t.decidedAt).toISOString(), new Date(t.entryTime).toISOString(), t.entry, new Date(t.exitTime).toISOString(), t.exit, t.outcome, t.pnlUsd.toFixed(4), t.r.toFixed(4), t.barsHeld, t.techScore.toFixed(3)].join(','));
  fs.writeFileSync(csv, head + rows.join('\n') + '\n');
  report.tradesFile = path.basename(csv);
  const json = path.join(dir, `${base}.json`);
  fs.writeFileSync(json, JSON.stringify(report));
  fs.copyFileSync(json, path.join(dir, `latest-${report.market}.json`));
  return { json, csv };
}

export function readLatestReport(dataDir: string, market: string): BacktestReport | null {
  if (!['futures', 'spot', 'forex'].includes(market)) return null;
  const f = path.join(dataDir, 'backtests', `latest-${market}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function listReports(dataDir: string): Array<{ file: string; market: string; createdAt: number; trades: number }> {
  const dir = path.join(dataDir, 'backtests');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^(futures|spot|forex)-.*\.json$/.test(f) && !f.startsWith('latest-')).map((f) => {
    try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BacktestReport; return { file: f, market: r.market, createdAt: r.createdAt, trades: r.summary.trades }; }
    catch { return null; }
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.createdAt - a.createdAt);
}
