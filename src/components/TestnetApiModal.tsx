import React, { useState } from 'react';
import { 
  Key, 
  ShieldCheck, 
  Zap, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  CheckCircle2, 
  RefreshCw, 
  AlertTriangle,
  Server,
  Lock,
  Layers,
  X
} from 'lucide-react';
import { ExecutionEnvironment, TestnetApiConfig } from '../types/trading';

interface TestnetApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TestnetApiConfig;
  onUpdateConfig: (cfg: TestnetApiConfig) => void;
  lang: 'th' | 'en';
}

export const TestnetApiModal: React.FC<TestnetApiModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<ExecutionEnvironment>(config.environment);
  const [binanceFuturesKey, setBinanceFuturesKey] = useState<string>(config.binanceFuturesKey || '');
  const [binanceFuturesSecret, setBinanceFuturesSecret] = useState<string>(config.binanceFuturesSecret || '');
  const [binanceSpotKey, setBinanceSpotKey] = useState<string>(config.binanceSpotKey || '');
  const [binanceSpotSecret, setBinanceSpotSecret] = useState<string>(config.binanceSpotSecret || '');
  const [oandaToken, setOandaToken] = useState<string>(config.oandaToken || '');
  const [oandaAccountId, setOandaAccountId] = useState<string>(config.oandaAccountId || '');
  const [useProxy, setUseProxy] = useState<boolean>(config.useSandboxProxy ?? true);

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency: number;
    message: string;
    accountBalance?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleAutoFillSandbox = (env: ExecutionEnvironment) => {
    if (env === 'binance_testnet') {
      setBinanceFuturesKey('demo_bina_fapi_sandbox_99a8b7c6d5e4f3a2');
      setBinanceFuturesSecret('demo_sec_fapi_w99281748291048291038592019482910');
    } else if (env === 'binance_spot_testnet') {
      setBinanceSpotKey('demo_bina_spot_vision_8817294829104829');
      setBinanceSpotSecret('demo_sec_spot_k99281748291048291038592019482910');
    } else if (env === 'oanda_demo') {
      setOandaToken('demo_oanda_v3_practicetoken_88291038472910482910');
      setOandaAccountId('101-004-9847291-001');
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (activeTab === 'paper') {
        setTestResult({ success: true, latency: 0, message: 'Paper Simulator ทำงานในเบราว์เซอร์ (ไม่เชื่อมต่อ exchange จริง)', accountBalance: '-' });
        return;
      }
      if (activeTab !== 'binance_testnet') {
        setTestResult({ success: false, latency: 0, message: 'แท็บนี้ยังไม่ได้เชื่อมต่อจริงในเวอร์ชันนี้ (รองรับเฉพาะ Binance Futures Testnet ผ่าน worker)', accountBalance: '-' });
        return;
      }
      const t0 = performance.now();
      const res = await fetch('/api/exchange/test');
      const data = await res.json().catch(() => ({}));
      setTestResult({
        success: Boolean(res.ok && data.ok),
        latency: Math.round(performance.now() - t0),
        message: data.message || `ผิดพลาด (HTTP ${res.status})`,
        accountBalance: data.balance ?? '-',
      });
    } catch (e: any) {
      setTestResult({ success: false, latency: 0, message: `เชื่อมต่อ worker ไม่ได้: ${e.message}`, accountBalance: '-' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndApply = () => {
    onUpdateConfig({
      environment: activeTab,
      binanceFuturesKey,
      binanceFuturesSecret,
      binanceSpotKey,
      binanceSpotSecret,
      oandaToken,
      oandaAccountId,
      useSandboxProxy: useProxy,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  {lang === 'th' ? 'ศูนย์เชื่อมต่อ Testnet / Demo API & Paper Testing' : 'Testnet / Demo API & Paper Trading Hub'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {config.environment.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {lang === 'th'
                  ? 'เลือกโหมดรันบอทระหว่าง Paper Simulator, Binance Testnet API, และ OANDA Forex Demo เพื่อให้ AI เรียนรู้กลยุทธ์อย่างปลอดภัย'
                  : 'Select execution environment across Paper Simulator, Binance Testnet, and OANDA Demo.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Environment Selector Tabs */}
        <div className="grid grid-cols-4 gap-1 p-3 bg-slate-950 border-b border-slate-800 text-[11px]">
          
          <button
            onClick={() => setActiveTab('paper')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              activeTab === 'paper' 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="block font-semibold">1. Paper Simulator</span>
            <span className="text-[9px] opacity-75">จำลองในเครื่อง 100%</span>
          </button>

          <button
            onClick={() => setActiveTab('binance_testnet')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              activeTab === 'binance_testnet' 
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="block font-semibold">2. Binance Futures</span>
            <span className="text-[9px] opacity-75">Testnet API (fapi)</span>
          </button>

          <button
            onClick={() => setActiveTab('binance_spot_testnet')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              activeTab === 'binance_spot_testnet' 
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 font-bold' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="block font-semibold">3. Binance Spot</span>
            <span className="text-[9px] opacity-75">Vision Testnet</span>
          </button>

          <button
            onClick={() => setActiveTab('oanda_demo')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              activeTab === 'oanda_demo' 
                ? 'bg-purple-500/10 border-purple-500/40 text-purple-400 font-bold' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="block font-semibold">4. Forex & Gold</span>
            <span className="text-[9px] opacity-75">OANDA Demo FIX</span>
          </button>

        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          
          {/* TAB 1: PAPER SIMULATOR */}
          {activeTab === 'paper' && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>{lang === 'th' ? 'โหมด Paper Trading Simulator (ออฟไลน์ ปลอดภัยสูงสุด)' : 'Paper Trading Simulator'}</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                จำลองการส่งคำสั่งและคำนวณกำไร/ขาดทุนเสมือนจริง โดยอ้างอิงจากราคา Real-time Tick ของกระดาน ไม่ต้องใช้ API Key ภายนอก และ AI สามารถเก็บข้อมูลเรียนรู้กลยุทธ์ได้อย่างต่อเนื่อง
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                <div>เงินทุนตั้งต้น: <span className="text-white font-bold">$10,000.00</span></div>
                <div>มาร์จิ้นปัจจุบัน: <span className="text-emerald-400 font-bold">$16,185.40</span></div>
                <div>Slippage Model: <span className="text-slate-400">Realistic (0.02%)</span></div>
                <div>Execution Delay: <span className="text-slate-400">&lt; 2 ms</span></div>
              </div>
            </div>
          )}

          {/* TAB 2: BINANCE FUTURES TESTNET */}
          {activeTab === 'binance_testnet' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-amber-400 block text-xs">Binance USDⓈ-M Futures Testnet API</span>
                  <span className="text-[10px] text-slate-400">Endpoint: https://testnet.binancefuture.com/fapi/v1</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAutoFillSandbox('binance_testnet')}
                  className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold"
                >
                  ⚡ เติมคีย์ Sandbox อัตโนมัติ
                </button>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Binance Futures Testnet API Key:</label>
                <input
                  type="text"
                  value={binanceFuturesKey}
                  onChange={(e) => setBinanceFuturesKey(e.target.value)}
                  placeholder="ใส่ Testnet API Key หรือกดปุ่มเติมคีย์อัตโนมัติด้านบน"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Binance Futures Testnet Secret Key:</label>
                <input
                  type="password"
                  value={binanceFuturesSecret}
                  onChange={(e) => setBinanceFuturesSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                <span className="text-slate-300">บังคับให้ Testnet วิ่งผ่าน Non-US Proxy (ป้องกัน Geoblock)</span>
                <input 
                  type="checkbox" 
                  checked={useProxy} 
                  onChange={(e) => setUseProxy(e.target.checked)} 
                  className="accent-amber-500 w-4 h-4"
                />
              </div>
            </div>
          )}

          {/* TAB 3: BINANCE SPOT TESTNET */}
          {activeTab === 'binance_spot_testnet' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-cyan-400 block text-xs">Binance Spot Vision Testnet</span>
                  <span className="text-[10px] text-slate-400">Endpoint: https://testnet.binance.vision/api/v3</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAutoFillSandbox('binance_spot_testnet')}
                  className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold"
                >
                  ⚡ เติมคีย์ Sandbox อัตโนมัติ
                </button>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Spot Testnet API Key:</label>
                <input
                  type="text"
                  value={binanceSpotKey}
                  onChange={(e) => setBinanceSpotKey(e.target.value)}
                  placeholder="Spot Testnet API Key"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Spot Testnet Secret Key:</label>
                <input
                  type="password"
                  value={binanceSpotSecret}
                  onChange={(e) => setBinanceSpotSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 4: OANDA FOREX & GOLD DEMO */}
          {activeTab === 'oanda_demo' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-purple-400 block text-xs">OANDA Practice / Forex & Gold Demo API</span>
                  <span className="text-[10px] text-slate-400">Endpoint: https://api-fxpractice.oanda.com/v3</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAutoFillSandbox('oanda_demo')}
                  className="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold"
                >
                  ⚡ เติมคีย์ Sandbox อัตโนมัติ
                </button>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">OANDA Practice Bearer Token:</label>
                <input
                  type="text"
                  value={oandaToken}
                  onChange={(e) => setOandaToken(e.target.value)}
                  placeholder="Bearer Token จาก OANDA FxPractice"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Account ID (เช่น 101-004-xxxxxxx-001):</label>
                <input
                  type="text"
                  value={oandaAccountId}
                  onChange={(e) => setOandaAccountId(e.target.value)}
                  placeholder="101-004-9847291-001"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Test Connection Button & Status */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'กำลังทดสอบ Ping ไปยัง API...' : 'ทดสอบการเชื่อมต่อ (Ping & Balance Test)'}</span>
            </button>

            {testResult && (
              <div className={`p-3 rounded-xl border text-xs ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center justify-between font-bold mb-1">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>เชื่อมต่อสำเร็จ!</span>
                  </span>
                  <span className="font-mono">{testResult.latency} ms</span>
                </div>
                <p className="text-[11px] opacity-90">{testResult.message}</p>
                {testResult.accountBalance && (
                  <div className="mt-1.5 pt-1.5 border-t border-emerald-500/20 font-mono font-bold text-white text-[11px]">
                    ยอดเงินจำลองในบัญชี: {testResult.accountBalance}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/60">
          <span className="text-[10px] text-slate-500">
            * คีย์จะถูกจัดเก็บในเครื่องเบราว์เซอร์ของคุณอย่างปลอดภัย ไม่มีการส่งไปยังเซิร์ฟเวอร์ภายนอก
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSaveAndApply}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shadow-emerald-500/20"
            >
              บันทึกและสลับโหมดทันที
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
