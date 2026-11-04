import React, { useEffect, useState } from 'react';
import { Bot, History } from 'lucide-react';

type Tab = 'phase1' | 'backtest';
interface HeaderProps { tab: Tab; setTab: (t: Tab) => void; lang: 'th' | 'en'; setLang: (l: 'th' | 'en') => void }

/** Real status of the worker (not a toggle): polls the dashboard API. */
function useWorkerStatus() {
  const [s, setS] = useState<{ ok: boolean; dryRun?: boolean; dataSource?: string; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/phase1/status');
        const b = await r.json().catch(() => ({}));
        if (alive) setS(r.ok ? { ok: true, dryRun: b.dryRun, dataSource: b.dataSource } : { ok: false, error: b.message || `HTTP ${r.status}` });
      } catch (e: any) { if (alive) setS({ ok: false, error: e.message }); }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return s;
}

export const Header: React.FC<HeaderProps> = ({ tab, setTab, lang, setLang }) => {
  const w = useWorkerStatus();
  const th = lang === 'th';
  const tabs: Array<{ id: Tab; icon: React.ReactNode; label: string }> = [
    { id: 'phase1', icon: <Bot className="w-4 h-4 shrink-0" />, label: 'Phase 1' },
    { id: 'backtest', icon: <History className="w-4 h-4 shrink-0" />, label: 'Backtest' },
  ];
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-bold text-emerald-400">Q</div>
          <span className="whitespace-nowrap text-lg font-bold tracking-tight text-white">QuantumTrade AI</span>
        </div>
        <nav className="flex items-center gap-1 text-sm font-medium">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 transition-colors ${tab === t.id ? 'bg-emerald-500/10 font-semibold text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <span title={w?.error ?? ''}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] ${w === null ? 'border-slate-700 text-slate-400' : w.ok ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/40 text-red-300'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${w === null ? 'bg-slate-500' : w.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {w === null ? '…' : w.ok ? `worker${w.dryRun ? ' · DRY_RUN' : ''}` : th ? 'worker ไม่ตอบ' : 'worker down'}
          </span>
          <button onClick={() => setLang(th ? 'en' : 'th')} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200">{lang.toUpperCase()}</button>
        </div>
      </div>
    </header>
  );
};
