import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

// REAL backtest results produced by `worker/phase1/backtest` (real exchange history, same rules as the live bot).
// This replaces the old simulator that generated random candles and random win/loss outcomes.

type Market = 'futures' | 'spot' | 'forex';
interface Slice { n: number; winRate: number | null; pnlUsd: number; expectancyR: number | null }
interface Report {
  market: Market; createdAt: number; params: Record<string, number | string>; symbols: string[];
  range: { from: number | null; to: number | null };
  dataQuality: Record<string, { bars: number; first: number | null; last: number | null; gaps: number; largestGapHours: number; removed: number }>;
  summary: {
    trades: number; wins: number; losses: number; winRate: number | null; profitFactor: number | null; expectancyR: number | null;
    expectancyUsd: number | null; totalPnlUsd: number; maxDrawdownUsd: number; longestLossStreak: number; avgHoldHours: number | null;
    outcomes: { tp: number; sl: number; timeout: number };
  };
  byYear: Record<string, Slice>; bySide: Record<string, Slice>; bySymbol: Record<string, Slice>; byHalf: Record<string, Slice>;
  signals: number; skipped: Record<string, number>; unfinished: number;
  equity: Array<{ t: number; pnl: number }>;
  bootstrap: { mean: number | null; lo: number | null; hi: number | null };
  benchmark: { iterations: number; tradesPerIteration: number; actualMeanR: number | null; random: { mean: number; sd: number; p5: number; p50: number; p95: number } | null; pValue: number | null };
  reference: Record<string, { from: number; to: number; holdReturnPct: number }>;
  warnings: string[];
}
interface DataFile { symbol: string; interval: string; bars: number; first: number | null; last: number | null }

const MARKETS: Array<{ id: Market; th: string; en: string }> = [
  { id: 'futures', th: 'Binance Futures', en: 'Binance Futures' },
  { id: 'spot', th: 'Binance Spot', en: 'Binance Spot' },
  { id: 'forex', th: 'Forex + ทอง', en: 'Forex + Gold' },
];
const n2 = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(d));
const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(d)}%`);
const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '-');

/** Plain-language reading of the numbers. Deliberately hard to impress. */
function verdict(r: Report, th: boolean): { tone: 'good' | 'bad' | 'neutral'; text: string } {
  const s = r.summary, b = r.bootstrap, p = r.benchmark.pValue;
  if (s.trades < 100) return { tone: 'neutral', text: th ? `มีเพียง ${s.trades} เทรด น้อยเกินกว่าจะสรุป` : `Only ${s.trades} trades — too few to conclude anything` };
  if (b.hi !== null && b.hi < 0) return { tone: 'bad', text: th ? 'ขาดทุนอย่างมีนัยสำคัญ: ช่วงเชื่อมั่น 95% ของกำไรต่อเทรดอยู่ต่ำกว่าศูนย์ทั้งช่วง' : 'Significantly losing: the whole 95% interval is below zero' };
  if (b.lo !== null && b.lo > 0 && p !== null && p < 0.05) return { tone: 'good', text: th ? 'พบสัญญาณว่ามี edge เชิงสถิติ (ทั้งช่วงเชื่อมั่นเป็นบวก และดีกว่าสุ่มจังหวะเข้า) แต่ยังต้องยืนยันกับข้อมูลช่วงอื่นและการรันสดก่อนเชื่อ' : 'Statistical edge detected (interval above zero and better than random timing) — still confirm on other periods and live' };
  return { tone: 'neutral', text: th ? 'ยังไม่มีหลักฐานว่ากลยุทธ์ทำกำไรได้ ช่วงเชื่อมั่นคร่อมศูนย์หรือไม่ดีกว่าสุ่มจังหวะเข้า' : 'No evidence yet that the strategy makes money: interval straddles zero or does not beat random timing' };
}

const Equity: React.FC<{ pts: Array<{ t: number; pnl: number }> }> = ({ pts }) => {
  if (pts.length < 2) return null;
  const W = 600, H = 150, pad = 6;
  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.pnl);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  const X = (t: number) => pad + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * pad);
  const Y = (v: number) => H - pad - ((v - y0) / Math.max(1e-9, y1 - y0)) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1].pnl;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36 rounded bg-slate-900/50">
      <line x1={pad} x2={W - pad} y1={Y(0)} y2={Y(0)} stroke="#475569" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={last >= 0 ? '#34d399' : '#f87171'} strokeWidth="1.5" />
    </svg>
  );
};

const Table: React.FC<{ rows: Array<[string, Slice]>; th: boolean }> = ({ rows, th }) => (
  <table className="w-full text-left text-xs">
    <thead className="text-slate-400"><tr><th className="p-1">&nbsp;</th><th>{th ? 'เทรด' : 'trades'}</th><th>Win%</th><th>R/{th ? 'เทรด' : 'trade'}</th><th>PnL</th></tr></thead>
    <tbody>
      {rows.map(([k, v]) => (
        <tr key={k} className="border-t border-slate-800">
          <td className="p-1 font-mono">{k}</td><td>{v.n}</td><td>{pct(v.winRate, 0)}</td>
          <td className={(v.expectancyR ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{n2(v.expectancyR, 3)}</td>
          <td className={v.pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>{n2(v.pnlUsd)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const BacktestView: React.FC<{ lang: 'th' | 'en' }> = ({ lang }) => {
  const th = lang === 'th';
  const [market, setMarket] = useState<Market>('futures');
  const [report, setReport] = useState<Report | null>(null);
  const [files, setFiles] = useState<DataFile[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (m: Market) => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([fetch(`/api/phase1/backtest/latest?market=${m}`), fetch('/api/phase1/backtest/data')]);
      const rb = await r.json().catch(() => ({}));
      if (r.ok) { setReport(rb.report); setMsg(null); } else { setReport(null); setMsg(rb.message || `HTTP ${r.status}`); }
      const db = await d.json().catch(() => ({}));
      setFiles(d.ok ? (db.datasets?.[m] ?? []) : []);
    } catch (e: any) { setReport(null); setMsg(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(market); }, [market, load]);

  const v = report ? verdict(report, th) : null;
  const tone = v?.tone === 'good' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : v?.tone === 'bad' ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-amber-500/50 bg-amber-500/10 text-amber-200';
  const sym = report ? Object.entries(report.bySymbol).sort((a, b) => b[1].pnlUsd - a[1].pnlUsd) : [];
  const cmd = `npx tsx worker/phase1/backtest/run.ts download --market ${market}${market === 'forex' ? '' : ' --top 20'}\nnpx tsx worker/phase1/backtest/run.ts run --market ${market}`;

  return (
    <div className="space-y-4 p-4 text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{th ? 'Backtest ข้อมูลจริง' : 'Real-data backtest'}</h2>
        <div className="ml-auto flex gap-1">
          {MARKETS.map((m) => (
            <button key={m.id} onClick={() => setMarket(m.id)} className={`rounded px-3 py-1 text-sm ${market === m.id ? 'bg-emerald-600/80' : 'bg-slate-700/60 hover:bg-slate-700'}`}>{th ? m.th : m.en}</button>
          ))}
          <button onClick={() => void load(market)} className="rounded bg-slate-700/60 px-2 hover:bg-slate-700" title="refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="rounded border border-slate-700 bg-slate-800/40 p-3 text-xs text-slate-300">
        {th
          ? 'ผลนี้มาจากราคาย้อนหลังจริง (Binance / Dukascopy) ด้วยกติกาเข้า-ออกเดียวกับบอท Phase 1 รวมค่าธรรมเนียมและ slippage ไม่รวมตัวกรอง Gemini AI (ทดสอบย้อนหลังอย่างซื่อสัตย์ไม่ได้) และไม่ได้ปรับพารามิเตอร์ให้เข้ากับข้อมูล'
          : 'Built from real historical prices (Binance / Dukascopy) with the same entry/exit rules as the Phase 1 bot, including fees and slippage. The Gemini AI filter is not included (it cannot be backtested honestly) and parameters were not tuned to the data.'}
      </div>

      {!report && (
        <div className="space-y-2 rounded border border-slate-700 p-4 text-sm">
          <div className="flex items-center gap-2 text-amber-300"><ShieldAlert className="w-4 h-4" />{th ? 'ยังไม่มีผล backtest ของตลาดนี้' : 'No backtest result for this market yet'}{msg ? ` (${msg})` : ''}</div>
          <p className="text-slate-400">{th ? 'รันบนเครื่องที่รัน worker (เครื่องที่ Binance เข้าถึงได้) แล้วกดรีเฟรชหน้านี้:' : 'Run on the machine that runs the worker, then refresh:'}</p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-xs">{cmd}</pre>
        </div>
      )}

      {report && v && (
        <>
          <div className={`rounded border p-3 text-sm ${tone}`}>{v.text}</div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {[
              [th ? 'เทรด' : 'Trades', String(report.summary.trades)],
              ['Win rate', pct(report.summary.winRate)],
              [th ? 'กำไร/เทรด (R)' : 'Expectancy (R)', n2(report.summary.expectancyR, 3)],
              ['Profit factor', n2(report.summary.profitFactor)],
              [`PnL (${th ? 'ไม้ละ' : 'per trade'} $${report.params.sizeUsd})`, `${n2(report.summary.totalPnlUsd)}`],
              ['Max drawdown', `${n2(report.summary.maxDrawdownUsd)}`],
            ].map(([k, val]) => (
              <div key={k} className="rounded border border-slate-700 bg-slate-800/40 p-2"><div className="text-xs text-slate-400">{k}</div><div className="text-lg font-semibold">{val}</div></div>
            ))}
          </div>
          <div className="text-xs text-slate-400">
            {th ? 'ช่วงเชื่อมั่น 95% ของ R ต่อเทรด' : '95% interval of R per trade'}: {n2(report.bootstrap.lo, 3)} … {n2(report.bootstrap.hi, 3)} · {th ? 'ข้อมูล' : 'data'} {day(report.range.from ?? Math.min(...Object.values(report.reference).map((x) => x.from)))} → {day(Math.max(...Object.values(report.reference).map((x) => x.to)))} · {report.symbols.length} {th ? 'สัญลักษณ์' : 'symbols'} · {th ? 'สร้างเมื่อ' : 'created'} {new Date(report.createdAt).toLocaleString()}
          </div>

          <Equity pts={report.equity} />

          {report.benchmark.random && (
            <div className="rounded border border-slate-700 p-3 text-sm">
              <div className="mb-1 font-semibold">{th ? 'เทียบกับการสุ่มจังหวะเข้า' : 'Versus random entry timing'}</div>
              <div className="text-slate-300">
                {th ? 'กลยุทธ์จริง' : 'Strategy'}: <b>{n2(report.benchmark.actualMeanR, 3)} R</b> · {th ? 'สุ่ม' : 'random'}: {n2(report.benchmark.random.mean, 3)} R ({n2(report.benchmark.random.p5, 3)} … {n2(report.benchmark.random.p95, 3)}) · p = <b>{n2(report.benchmark.pValue, 3)}</b>
              </div>
              <div className="mt-1 text-xs text-slate-400">{th ? 'p เล็ก (< 0.05) = จังหวะเข้าของสัญญาณดีกว่าการสุ่มจริง p ใหญ่ = ยังไม่มีหลักฐานว่าสัญญาณมีค่า' : 'Small p (< 0.05) = signal timing really beats random. Large p = no evidence the signal adds value.'}</div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-slate-700 p-3"><div className="mb-1 text-sm font-semibold">{th ? 'รายปี' : 'By year'}</div><Table rows={Object.entries(report.byYear)} th={th} /></div>
            <div className="rounded border border-slate-700 p-3">
              <div className="mb-1 text-sm font-semibold">{th ? 'ครึ่งแรก vs ครึ่งหลัง / ด้าน' : 'First vs second half / side'}</div>
              <Table rows={[...Object.entries(report.byHalf), ...Object.entries(report.bySide)]} th={th} />
            </div>
            <div className="rounded border border-slate-700 p-3"><div className="mb-1 text-sm font-semibold">{th ? 'สัญลักษณ์ที่ดีที่สุด' : 'Best symbols'}</div><Table rows={sym.slice(0, 6)} th={th} /></div>
            <div className="rounded border border-slate-700 p-3"><div className="mb-1 text-sm font-semibold">{th ? 'สัญลักษณ์ที่แย่ที่สุด' : 'Worst symbols'}</div><Table rows={sym.slice(-6).reverse()} th={th} /></div>
          </div>

          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="mb-1 font-semibold">{th ? 'ข้อควรระวัง' : 'Caveats'}</div>
            <ul className="list-disc space-y-1 pl-4">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        </>
      )}

      {files.length > 0 && (
        <details className="rounded border border-slate-700 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer">{th ? `ข้อมูลที่ดาวน์โหลดไว้ (${files.length} ไฟล์)` : `Downloaded data (${files.length} files)`}</summary>
          <div className="mt-2 grid gap-x-4 md:grid-cols-2">
            {files.map((f) => <div key={f.symbol + f.interval} className="font-mono">{f.symbol} {f.interval}: {f.bars.toLocaleString()} · {day(f.first)} → {day(f.last)}</div>)}
          </div>
        </details>
      )}
    </div>
  );
};
