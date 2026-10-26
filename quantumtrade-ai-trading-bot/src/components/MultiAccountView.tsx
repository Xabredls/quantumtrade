import React, { useState, useId } from 'react';
import { 
  Users, 
  Plus, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Key, 
  ExternalLink,
  Lock,
  Percent,
  Power
} from 'lucide-react';
import { AccountPortfolio, MarketType } from '../types/trading';

interface MultiAccountViewProps {
  accounts: AccountPortfolio[];
  onToggleAccount: (id: string) => void;
  onAddAccount: (newAcc: Omit<AccountPortfolio, 'id'>) => void;
  lang: 'th' | 'en';
}

export const MultiAccountView: React.FC<MultiAccountViewProps> = ({
  accounts,
  onToggleAccount,
  onAddAccount,
  lang,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [marketType, setMarketType] = useState<MarketType>('crypto_futures');
  const [exchange, setExchange] = useState<'Binance Futures' | 'Bybit' | 'MetaTrader 5' | 'OANDA'>('Binance Futures');
  const [initialBalance, setInitialBalance] = useState<number>(5000);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [isPaper, setIsPaper] = useState<boolean>(true);

  const accNameId = useId();
  const accMarketTypeId = useId();
  const accExchangeId = useId();
  const accInitBalanceId = useId();
  const accApiKeyId = useId();
  const accApiSecretId = useId();
  const accIsPaperId = useId();

  const totalEquity = accounts.reduce((s, a) => s + a.equity, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalUnrealizedPnl = totalEquity - totalBalance;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onAddAccount({
      name,
      marketType,
      exchange,
      balance: initialBalance,
      equity: initialBalance,
      initialBalance,
      leverage: marketType === 'crypto_futures' ? 10 : 20,
      isPaper,
      isActive: true,
      apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}••••••••${apiKey.slice(-4)}` : 'paper_key••••',
      apiSecretMasked: '••••••••••••••••',
    });

    setName('');
    setApiKey('');
    setApiSecret('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Portfolio Summary Strip */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>{lang === 'th' ? 'การจัดการพอร์ตโฟลิโอหลายบัญชี (Multi-Account Portfolio Engine)' : 'Multi-Account Portfolio Management'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'th'
                ? 'กระจายคำสั่งซื้อขายข้ามบัญชีย่อยทั้ง Crypto Futures และ Forex อัตโนมัติ เพื่อแยกความเสี่ยงของแต่ละกลยุทธ์'
                : 'Manage isolated sub-accounts across exchanges with automated risk parity and trade mirroring.'}
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'th' ? 'เพิ่มบัญชีพอร์ตใหม่' : 'Add New Account'}</span>
          </button>
        </div>

        {/* Aggregated KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-800">
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'มูลค่าพอร์ตรวม (Total Equity)' : 'Total Equity'}</span>
            <span className="text-xl font-mono font-bold text-white tabular-nums">${totalEquity.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'เงินทุนตั้งต้นรวม (Initial)' : 'Initial Balance'}</span>
            <span className="text-xl font-mono font-bold text-slate-300 tabular-nums">${totalBalance.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'กำไรที่ยังไม่รับรู้ (PnL)' : 'Total Unrealized PnL'}</span>
            <span className={`text-xl font-mono font-bold tabular-nums ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'บัญชีที่กำลังรันบอท' : 'Active Accounts'}</span>
            <span className="text-xl font-mono font-bold text-sky-400 tabular-nums">
              {accounts.filter(a => a.isActive).length} / {accounts.length}
            </span>
          </div>
        </div>
      </div>

      {/* Account List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const pnl = acc.equity - acc.initialBalance;
          const pnlPct = (pnl / acc.initialBalance) * 100;
          const isProfit = pnl >= 0;

          return (
            <div
              key={acc.id}
              className={`p-5 rounded-xl border transition-all ${
                acc.isActive 
                  ? 'border-slate-800 bg-slate-900/50' 
                  : 'border-slate-800/40 bg-slate-950/40 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{acc.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {acc.exchange}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>{acc.apiKeyMasked}</span>
                    <span>·</span>
                    <span className={acc.isPaper ? 'text-amber-400' : 'text-emerald-400 font-bold'}>
                      {acc.isPaper ? 'PAPER TEST' : 'LIVE API'}
                    </span>
                  </div>
                </div>

                {/* Active Toggle Switch */}
                <button
                  onClick={() => onToggleAccount(acc.id)}
                  title={acc.isActive ? 'หยุดการเทรดบัญชีนี้' : 'เปิดการเทรดบัญชีนี้'}
                  className={`p-2 rounded-lg transition-colors ${
                    acc.isActive 
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* Account Balance Details */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800/80 font-mono text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block">{lang === 'th' ? 'มูลค่า Equity' : 'Equity'}</span>
                  <span className="text-slate-200 font-bold text-sm">${acc.equity.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">{lang === 'th' ? 'เงินทุนเริ่มต้น' : 'Initial'}</span>
                  <span className="text-slate-300 text-sm">${acc.initialBalance.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 text-[10px] block">{lang === 'th' ? 'ผลตอบแทนรวม' : 'Return'}</span>
                  <span className={`text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'th' ? 'เชื่อมต่อพอร์ตโฟลิโอใหม่' : 'Connect New Portfolio'}</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label htmlFor={accNameId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ชื่อบัญชี' : 'Account Name'}</label>
                <input
                  id={accNameId}
                  type="text"
                  required
                  placeholder="เช่น Binance Futures Sub-2 หรือ MT5 EURUSD"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={accMarketTypeId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ตลาด' : 'Market'}</label>
                  <select
                    id={accMarketTypeId}
                    value={marketType}
                    onChange={(e) => setMarketType(e.target.value as MarketType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200"
                  >
                    <option value="crypto_futures">Crypto Futures</option>
                    <option value="forex">Forex & Metals</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={accExchangeId} className="block text-slate-300 mb-1">{lang === 'th' ? 'Exchange / โบรกเกอร์' : 'Broker'}</label>
                  <select
                    id={accExchangeId}
                    value={exchange}
                    onChange={(e) => setExchange(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200"
                  >
                    <option value="Binance Futures">Binance Futures</option>
                    <option value="Bybit">Bybit Futures</option>
                    <option value="MetaTrader 5">MetaTrader 5</option>
                    <option value="OANDA">OANDA</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor={accInitBalanceId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ยอดเงินจำลอง (USD)' : 'Initial Balance (USD)'}</label>
                <input
                  id={accInitBalanceId}
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded bg-slate-950 border border-slate-800">
                <input
                  type="checkbox"
                  id={accIsPaperId}
                  checked={isPaper}
                  onChange={(e) => setIsPaper(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <label htmlFor={accIsPaperId} className="text-slate-300">
                  {lang === 'th' ? 'โหมด Paper Test / Dry Run (จำลองไร้ความเสี่ยง)' : 'Paper Test / Dry Run Mode'}
                </label>
              </div>

              {!isPaper && (
                <div className="space-y-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5">
                  <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-[11px]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{lang === 'th' ? 'ความปลอดภัย API Key' : 'API Security Notice'}</span>
                  </div>
                  <div>
                    <label htmlFor={accApiKeyId} className="block text-slate-400 text-[10px] mb-0.5">API Key</label>
                    <input
                      id={accApiKeyId}
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="ป้อน API Key จาก Binance/Broker"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor={accApiSecretId} className="block text-slate-400 text-[10px] mb-0.5">API Secret</label>
                    <input
                      id={accApiSecretId}
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="ป้อน Secret Key"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  {lang === 'th' ? 'บันทึกบัญชี' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
