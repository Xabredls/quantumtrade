import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** Real test: dashboard -> worker -> Binance Futures (read-only: server time + balance). Sends no order. */
export const ConnectionCard: React.FC<{ lang: 'th' | 'en' }> = ({ lang }) => {
  const th = lang === 'th';
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; ms: number; message: string; balance?: string } | null>(null);

  const run = async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const r = await fetch('/api/exchange/test');
      const b = await r.json().catch(() => ({}));
      setRes({ ok: Boolean(r.ok && b.ok), ms: Math.round(performance.now() - t0), message: b.message || `HTTP ${r.status}`, balance: b.balance });
    } catch (e: any) {
      setRes({ ok: false, ms: 0, message: `${th ? 'เชื่อมต่อ worker ไม่ได้' : 'Cannot reach the worker'}: ${e.message}` });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{th ? 'ทดสอบการเชื่อมต่อ Binance' : 'Binance connection test'}</div>
        <div className="text-xs text-slate-400">
          {th ? 'ตรวจเส้นทางแดชบอร์ด → worker → Binance Futures (อ่านเวลาเซิร์ฟเวอร์และยอดเงินเท่านั้น ไม่ส่งออเดอร์)' : 'Checks dashboard → worker → Binance Futures (reads server time and balance only; sends no order)'}
        </div>
        {res && (
          <div className={`mt-2 text-xs ${res.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {res.ok ? '✅' : '❌'} {res.message}{res.balance ? ` · ${res.balance}` : ''}{res.ms ? ` · ${res.ms} ms` : ''}
          </div>
        )}
      </div>
      <button onClick={() => void run()} disabled={busy} className="flex items-center gap-1.5 rounded bg-slate-700/70 px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />{th ? 'ทดสอบ' : 'Test'}
      </button>
    </div>
  );
};
