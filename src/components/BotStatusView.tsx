import React, { useCallback, useEffect, useState } from 'react';
import { Bot, RefreshCw, ShieldAlert, Play } from 'lucide-react';

interface BotCycle { universe: number; passedVolume: number; scanned: number; candidates: number; opened: number; closed: number; error: string | null }
interface BotStat { closed: number; wins: number; losses: number; winRate: number | null; pnlUsd: number; open: number; breakerTripped: boolean; lastCycle: BotCycle | null }
interface Status {
  ok: boolean; dryRun: boolean; running: boolean; scanIntervalSec: number; klineInterval: string; dataSource: string;
  nextScanAt: number | null; lastScanAt: number | null; lastDurationMs: number | null;
  ai: { configured: boolean; model: string | null; lastError: string | null; callsLastHour: number };
  bots: Record<string, BotStat>;
}
interface Signal { id: number; ts: number; bot: string; symbol: string; side: string; tech_score: number; ai_confidence: number | null; action: string; skip_reason: string | null; ai_rationale: string | null }

const NAMES: Record<string, string> = { futures: 'Binance Futures', spot: 'Binance Spot', forex: 'Forex + Gold (Mock)' };
const time = (ts: number | null) => (ts ? new Date(ts).toLocaleTimeString() : '-');

export const BotStatusView: React.FC<{ lang: 'th' | 'en' }> = ({ lang }) => {
  const th = lang === 'th';
  const [status, setStatus] = useState<Status | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([fetch('/api/phase1/status'), fetch('/api/phase1/signals?limit=25')]);
      const sb = await s.json();
      if (!s.ok) throw new Error(sb.message || `HTTP ${s.status}`);
      setStatus(sb);
      setSignals(g.ok ? (await g.json()).signals : []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) setError((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`);
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 p-4 text-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <Bot className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-semibold">{th ? 'Phase 1 — สแกนเนอร์หลายบอท (Paper / DRY_RUN)' : 'Phase 1 — Multi-bot scanner (paper / DRY_RUN)'}</h2>
        <button onClick={() => post('/api/phase1/scan')} disabled={busy || status?.running}
          className="ml-auto flex items-center gap-1.5 rounded bg-emerald-600/80 px-3 py-1 text-sm hover:bg-emerald-600 disabled:opacity-40">
          {status?.running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {th ? 'สแกนตอนนี้' : 'Scan now'}
        </button>
      </div>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      {status && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">{status.dryRun ? `DRY_RUN — ${th ? 'ไม่ส่งออเดอร์จริง' : 'no real orders'}` : 'LIVE'}</span>
            <span className="rounded bg-slate-700/60 px-2 py-1">{th ? 'ข้อมูลตลาด' : 'data'}: {status.dataSource} · {status.klineInterval} · {th ? 'ทุก' : 'every'} {status.scanIntervalSec}s</span>
            <span className="rounded bg-slate-700/60 px-2 py-1">{th ? 'สแกนล่าสุด' : 'last'}: {time(status.lastScanAt)} ({status.lastDurationMs ? Math.round(status.lastDurationMs / 1000) : '-'}s) · {th ? 'ถัดไป' : 'next'}: {time(status.nextScanAt)}</span>
            <span className={`rounded px-2 py-1 ${status.ai.configured && !status.ai.lastError ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              AI: {status.ai.configured ? status.ai.model : th ? 'ไม่ได้ตั้งค่า (ไม่เปิดตำแหน่ง)' : 'not configured (no trades)'}{status.ai.lastError ? ` · ${status.ai.lastError}` : ''}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(status.bots).map(([bot, s]) => (
              <div key={bot} className={`rounded-lg border p-3 ${s.breakerTripped ? 'border-red-500/60 bg-red-500/5' : 'border-slate-700 bg-slate-800/40'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{NAMES[bot] ?? bot}</span>
                  {s.breakerTripped && (
                    <button onClick={() => post('/api/phase1/reset-breaker', { bot })} disabled={busy}
                      className="flex items-center gap-1 rounded bg-red-600/70 px-2 py-0.5 text-xs hover:bg-red-600">
                      <ShieldAlert className="w-3 h-3" /> {th ? 'หยุดอัตโนมัติ — กดรีเซ็ต' : 'tripped — reset'}
                    </button>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-400">{th ? 'ผ่านกรอง volume / ทั้งหมด' : 'volume-ok / universe'}</dt><dd>{s.lastCycle ? `${s.lastCycle.passedVolume} / ${s.lastCycle.universe}` : '-'}</dd>
                  <dt className="text-slate-400">{th ? 'สัญญาณรอบล่าสุด' : 'signals (last)'}</dt><dd>{s.lastCycle?.candidates ?? '-'}</dd>
                  <dt className="text-slate-400">{th ? 'ตำแหน่งเปิดอยู่' : 'open'}</dt><dd>{s.open}</dd>
                  <dt className="text-slate-400">{th ? 'ปิดแล้ว (ชนะ/แพ้)' : 'closed (W/L)'}</dt><dd>{s.closed} ({s.wins}/{s.losses})</dd>
                  <dt className="text-slate-400">Win rate</dt><dd>{s.winRate === null ? '-' : `${(s.winRate * 100).toFixed(0)}%`}</dd>
                  <dt className="text-slate-400">PnL (paper)</dt><dd className={s.pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>{s.pnlUsd.toFixed(2)} USD</dd>
                </dl>
                {s.lastCycle?.error && <div className="mt-2 text-xs text-red-300">{s.lastCycle.error}</div>}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400">
                <tr><th className="p-2">{th ? 'เวลา' : 'time'}</th><th>Bot</th><th>{th ? 'สัญลักษณ์' : 'symbol'}</th><th>{th ? 'ด้าน' : 'side'}</th><th>Tech</th><th>AI</th><th>{th ? 'ผล' : 'action'}</th></tr>
              </thead>
              <tbody>
                {signals.length === 0 && <tr><td colSpan={7} className="p-3 text-slate-500">{th ? 'ยังไม่มีสัญญาณ' : 'no signals yet'}</td></tr>}
                {signals.map((g) => (
                  <tr key={g.id} className="border-t border-slate-800" title={g.ai_rationale ?? ''}>
                    <td className="p-2">{time(g.ts)}</td><td>{g.bot}</td><td className="font-mono">{g.symbol}</td>
                    <td className={g.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{g.side}</td>
                    <td>{g.tech_score.toFixed(2)}</td><td>{g.ai_confidence === null ? '-' : g.ai_confidence.toFixed(2)}</td>
                    <td className={g.action === 'OPEN' ? 'text-emerald-300' : 'text-slate-400'}>{g.action === 'OPEN' ? 'OPEN' : g.skip_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
