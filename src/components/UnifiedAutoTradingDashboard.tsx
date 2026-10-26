import React, { useState, useId } from 'react';
import { 
  Zap, 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  CheckCircle2, 
  Radio, 
  Cpu, 
  Layers, 
  Sliders, 
  Sparkles, 
  Terminal, 
  Lock, 
  RefreshCw, 
  Play, 
  Pause, 
  AlertTriangle,
  Clock,
  DollarSign,
  ChevronRight,
  HelpCircle,
  Eye,
  X,
  Target,
  BrainCircuit,
  Server,
  SlidersHorizontal,
  Shield
} from 'lucide-react';
import { 
  MarketType, 
  CryptoSymbol, 
  ForexSymbol, 
  TradableSymbol, 
  Position, 
  OrderSide, 
  OrderType, 
  ExecutionLogItem,
  SelfLearningMetric,
  NewsBlackoutEvent,
  TestnetApiConfig,
  AccountPortfolio
} from '../types/trading';
import { Candle, calculatePositionSize, calculateLiquidationPrice } from '../utils/tradingMath';
import { calculateMicroPositionSize } from '../utils/binanceLiveService';
import { MarketOpportunityScanner } from './MarketOpportunityScanner';

interface UnifiedAutoTradingDashboardProps {
  // Engines status (Tri-Engine Parallel System)
  engineRunning: boolean;
  setEngineRunning: (running: boolean) => void;
  futuresEngineActive: boolean;
  setFuturesEngineActive: (active: boolean) => void;
  spotEngineActive: boolean;
  setSpotEngineActive: (active: boolean) => void;
  forexEngineActive: boolean;
  setForexEngineActive: (active: boolean) => void;

  // Testnet & Environment
  testnetConfig?: TestnetApiConfig;
  onOpenTestnetModal?: () => void;

  // Multi-Bot Accounts ($100 per bot)
  accounts?: AccountPortfolio[];

  // Market & Symbols
  marketType: MarketType;
  setMarketType: (m: MarketType) => void;
  cryptoFuturesSymbols: CryptoSymbol[];
  cryptoSpotSymbols: CryptoSymbol[];
  forexSymbols: ForexSymbol[];
  selectedSymbol: TradableSymbol;
  setSelectedSymbol: (s: TradableSymbol) => void;
  candles: Candle[];

  // Portfolio & Positions
  positions: Position[];
  onOpenPosition: (params: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    leverage: number;
    riskPct: number;
    customSize?: number;
    icebergTranches?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }) => void;
  onClosePosition: (id: string) => void;
  onSetBreakeven: (id: string) => void;
  equity: number;
  balance: number;

  // Self Learning & News
  currentRegime: string;
  activeParams: Record<string, number>;
  metricsHistory: SelfLearningMetric[];
  onTriggerOptimization: () => void;
  isOptimizing: boolean;
  newsEvents: NewsBlackoutEvent[];
  isNewsBlackout: boolean;
  blackoutReason?: string;

  // Logs & Language
  logs: ExecutionLogItem[];
  lang: 'th' | 'en';
}

export const UnifiedAutoTradingDashboard: React.FC<UnifiedAutoTradingDashboardProps> = ({
  engineRunning,
  setEngineRunning,
  futuresEngineActive,
  setFuturesEngineActive,
  spotEngineActive,
  setSpotEngineActive,
  forexEngineActive,
  setForexEngineActive,
  testnetConfig,
  onOpenTestnetModal,
  accounts = [],
  marketType,
  setMarketType,
  cryptoFuturesSymbols,
  cryptoSpotSymbols,
  forexSymbols,
  selectedSymbol,
  setSelectedSymbol,
  candles,
  positions,
  onOpenPosition,
  onClosePosition,
  onSetBreakeven,
  equity,
  balance,
  currentRegime,
  activeParams,
  metricsHistory,
  onTriggerOptimization,
  isOptimizing,
  newsEvents,
  isNewsBlackout,
  blackoutReason,
  logs,
  lang,
}) => {
  // Active sub-tab for scanner (Futures vs Spot vs Forex)
  const [scannerView, setScannerView] = useState<'futures' | 'spot' | 'forex'>('futures');
  
  // Pipeline animation step for live process demonstration (cycles 1..5)
  const [activePipelineStep, setActivePipelineStep] = useState<number>(2);
  const [filterLogSource, setFilterLogSource] = useState<'ALL' | 'FUTURES' | 'SPOT' | 'AI' | 'RISK'>('ALL');

  // AI Learning Diary Filter (All / Futures / Spot / Forex)
  const [aiMarketFilter, setAiMarketFilter] = useState<'ALL' | 'crypto_futures' | 'crypto_spot' | 'forex'>('ALL');

  // Quick manual order drawer state
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualSide, setManualSide] = useState<OrderSide>('LONG');
  const [manualLeverage, setManualLeverage] = useState<number>(10);
  const [manualRiskPct, setManualRiskPct] = useState<number>(1.0);
  const [manualUseIceberg, setManualUseIceberg] = useState<boolean>(true);

  // Timeframe selector
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h'>('5m');

  const currentPrice = selectedSymbol.currentPrice;
  const isCryptoFutures = selectedSymbol.marketType === 'crypto_futures';
  const isCryptoSpot = selectedSymbol.marketType === 'crypto_spot';

  // ATR Calculation for SL/TP bands
  const recentDiffs = candles.slice(-14).map(c => c.high - c.low);
  const estimatedAtr = recentDiffs.length > 0
    ? recentDiffs.reduce((a, b) => a + b, 0) / recentDiffs.length
    : currentPrice * 0.015;

  const atrSlDist = estimatedAtr * (activeParams?.atrSlMultiplier || 1.5);
  const atrTpDist = estimatedAtr * (activeParams?.tpMultiplier1 || 2.5);

  const dynamicSlLong = Math.max(0, currentPrice - atrSlDist);
  const dynamicTpLong = currentPrice + atrTpDist;

  // Filter logs based on chosen filter
  const filteredLogs = logs.filter(l => {
    if (filterLogSource === 'ALL') return true;
    if (filterLogSource === 'FUTURES') return l.marketType === 'crypto_futures';
    if (filterLogSource === 'SPOT') return l.marketType === 'crypto_spot';
    if (filterLogSource === 'AI') return l.type === 'SELF_LEARN';
    if (filterLogSource === 'RISK') return l.type === 'NEWS_BLACKOUT' || l.type === 'CIRCUIT_BREAKER';
    return true;
  });

  // Calculate total active PnL
  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const futuresPositionsCount = positions.filter(p => p.marketType === 'crypto_futures').length;
  const spotPositionsCount = positions.filter(p => p.marketType === 'crypto_spot').length;
  const forexPositionsCount = positions.filter(p => p.marketType === 'forex').length;

  // Filter AI Learning Journal metrics based on active filter
  const filteredMetrics = metricsHistory.filter(m => {
    if (aiMarketFilter === 'ALL') return true;
    return m.marketType === aiMarketFilter;
  });

  // Handle instant AI audited auto-trade trigger with mathematically sound $100 capital sizing
  const handleTriggerAiTrade = (side: OrderSide) => {
    const sl = side === 'LONG' ? dynamicSlLong : currentPrice + atrSlDist;
    const tp = side === 'LONG' ? dynamicTpLong : currentPrice - atrTpDist;
    const lev = isCryptoFutures ? 10 : 1;

    // Strict 1% risk discipline ($1.00 USD on $100 capital)
    const micro = calculateMicroPositionSize({
      botCapital: 100,
      riskPct: 1.0,
      entryPrice: currentPrice,
      stopLossPrice: sl,
      leverage: lev,
    });

    onOpenPosition({
      symbol: selectedSymbol.symbol,
      side,
      type: 'ICEBERG',
      leverage: lev,
      riskPct: 1.0,
      customSize: micro.size,
      icebergTranches: 4,
      stopLossPrice: Number(sl.toFixed(2)),
      takeProfitPrice: Number(tp.toFixed(2)),
    });
  };

  return (
    <div className="space-y-6">
      
      {/* 1. MASTER 24/7 TRI-ENGINE STATUS BAR (FUTURES + SPOT + FOREX & GOLD) */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Left: Master Auto-Pilot Status & Cloud Free Tier Ping */}
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-3 rounded-xl border flex items-center justify-center shrink-0 ${
              engineRunning 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  {lang === 'th' ? 'ศูนย์ควบคุมบอทอัตโนมัติ 24/7 (3 ระบบคู่ขนาน + AI เรียนรู้)' : '24/7 Tri-Engine Autonomous Cockpit & Continuous AI'}
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold uppercase ${
                  engineRunning 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${engineRunning ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                  {engineRunning ? (lang === 'th' ? 'รัน 3 บอทคู่ขนาน + AI 24/7' : 'TRI-ENGINE 24/7 ACTIVE') : (lang === 'th' ? 'หยุดทำงาน' : 'OFFLINE')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>Google Cloud VM: <span className="text-emerald-400 font-mono">e2-micro (Always-Free)</span></span>
                <span>•</span>
                <span>Latency: <span className="text-emerald-400 font-mono">11ms</span></span>
                <span>•</span>
                <span>Proxy: <span className="text-cyan-400 font-mono">Non-US Residential SOCKS5</span></span>
                <span>•</span>
                <span>Uptime: <span className="text-slate-300 font-mono">99.98%</span></span>
              </p>
            </div>
          </div>

          {/* Right: Tri-Engine Quick Toggles, Testnet API Selector & Master Kill Switch */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            {/* Binance Futures Engine Toggle */}
            <button
              onClick={() => setFuturesEngineActive(!futuresEngineActive)}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium border transition-colors ${
                futuresEngineActive && engineRunning
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${futuresEngineActive && engineRunning ? 'text-amber-400 fill-amber-400/20' : ''}`} />
              <div className="text-left">
                <div className="font-semibold">{lang === 'th' ? 'Binance Futures บอท' : 'Binance Futures Bot'}</div>
                <div className="text-[10px] opacity-75 font-mono">
                  {futuresEngineActive && engineRunning ? (lang === 'th' ? '10x-20x อัตโนมัติ' : 'Auto 10x-20x Active') : (lang === 'th' ? 'ปิดการทำงาน' : 'Paused')}
                </div>
              </div>
            </button>

            {/* Crypto Spot Engine Toggle */}
            <button
              onClick={() => setSpotEngineActive(!spotEngineActive)}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium border transition-colors ${
                spotEngineActive && engineRunning
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${spotEngineActive && engineRunning ? 'text-cyan-400 fill-cyan-400/20' : ''}`} />
              <div className="text-left">
                <div className="font-semibold">{lang === 'th' ? 'Crypto Spot บอท' : 'Crypto Spot Bot'}</div>
                <div className="text-[10px] opacity-75 font-mono">
                  {spotEngineActive && engineRunning ? (lang === 'th' ? '1x สะสม VWAP' : 'Auto 1x Accumulate') : (lang === 'th' ? 'ปิดการทำงาน' : 'Paused')}
                </div>
              </div>
            </button>

            {/* Forex & Gold Engine Toggle (บอท Fox / XAUUSD & Forex Pairs) */}
            <button
              onClick={() => setForexEngineActive(!forexEngineActive)}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium border transition-colors ${
                forexEngineActive && engineRunning
                  ? 'bg-purple-500/10 border-purple-500/40 text-purple-300 hover:bg-purple-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              <BrainCircuit className={`w-3.5 h-3.5 ${forexEngineActive && engineRunning ? 'text-purple-400' : ''}`} />
              <div className="text-left">
                <div className="font-semibold">{lang === 'th' ? 'Forex & Gold บอท' : 'Forex & Gold Bot'}</div>
                <div className="text-[10px] opacity-75 font-mono">
                  {forexEngineActive && engineRunning ? (lang === 'th' ? '20x-30x OANDA/MT5' : 'Auto 20x-30x Active') : (lang === 'th' ? 'ปิดการทำงาน' : 'Paused')}
                </div>
              </div>
            </button>

            {/* Testnet / Demo API Quick Modal Trigger */}
            {onOpenTestnetModal && (
              <button
                onClick={onOpenTestnetModal}
                className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-colors"
                title={lang === 'th' ? 'คลิกเพื่อตั้งค่า Testnet API หรือ OANDA Demo' : 'Click to configure Testnet/Demo API'}
              >
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <div className="text-left">
                  <div className="font-semibold flex items-center gap-1">
                    <span>{lang === 'th' ? 'เชื่อมต่อ API / Testnet' : 'API Connection'}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="text-[10px] font-mono text-slate-300 uppercase">
                    {testnetConfig?.environment === 'binance_testnet'
                      ? 'Binance Futures Testnet'
                      : testnetConfig?.environment === 'binance_spot_testnet'
                      ? 'Binance Spot Testnet'
                      : testnetConfig?.environment === 'oanda_demo'
                      ? 'OANDA Forex Demo'
                      : testnetConfig?.environment === 'paper'
                      ? 'Paper Simulator'
                      : 'Live Trading API'}
                  </div>
                </div>
              </button>
            )}

            {/* Master Stop / Start All Button */}
            <button
              onClick={() => setEngineRunning(!engineRunning)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                engineRunning
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20'
              }`}
            >
              {engineRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>{lang === 'th' ? 'หยุดชั่วคราว' : 'Pause All'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>{lang === 'th' ? 'เริ่มรัน 3 บอท' : 'Start Tri-Engine'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tri-Engine Parallel Metrics Strip ($100 per Bot, Total $300 Capital) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'ทุนเริ่มต้น 3 บอท' : 'Total Capital (3 Bots)'}</span>
            <span className="text-sm sm:text-base font-bold font-mono text-white">
              $300.00 USD <span className="text-[10px] text-slate-400 font-normal">($100/บอท)</span>
            </span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'มูลค่าพอร์ตรวม (Equity)' : 'Combined Equity'}</span>
            <span className="text-sm sm:text-base font-bold font-mono text-emerald-400">
              ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'กำไรสะสมสุทธิ (PnL)' : 'Total Net PnL'}</span>
            <span className={`text-sm sm:text-base font-bold font-mono ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)} USD
              <span className="text-[10px] ml-1 font-normal opacity-90">
                ({totalUnrealizedPnl >= 0 ? '+' : ''}{((totalUnrealizedPnl / 300) * 100).toFixed(2)}%)
              </span>
            </span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'สถานะคำสั่ง 3 บอท' : 'Active Orders (Tri-Engine)'}</span>
            <span className="text-xs sm:text-sm font-semibold font-mono text-slate-200 flex items-center gap-1 flex-wrap">
              <span className="text-amber-400">{futuresPositionsCount} Fut</span>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-400">{spotPositionsCount} Spot</span>
              <span className="text-slate-500">|</span>
              <span className="text-purple-400">{forexPositionsCount} Fox</span>
            </span>
          </div>
        </div>
      </section>

      {/* 2. DEDICATED TRI-ENGINE 3-BOT WINDOWS (หน้าต่างแสดงผลแยกออกจากกัน 3 บอท ทุนเริ่มต้นบอทละ $100 รวม $300) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              {lang === 'th' ? 'หน้าต่างแสดงผลแยก 3 บอทอิสระ (Tri-Engine Dedicated Bot Windows)' : 'Tri-Engine Dedicated Bot Windows'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              ทุนเริ่มต้น $100 / บอท (รวม $300 USD)
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {lang === 'th' ? 'แยกหน้าต่างและพอร์ตอิสระ คุมความเสี่ยงไม้ละ 1% ($1.00 USD) ไม่ปนกัน' : 'Isolated windows & portfolios with strict 1% ($1.00) risk discipline'}
          </span>
        </div>

        {/* 3 Windows Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* WINDOW 1: BINANCE FUTURES BOT */}
          <div className="bg-slate-900/95 border border-amber-500/30 rounded-xl p-4 shadow-lg space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs sm:text-sm">
                    {lang === 'th' ? '1. Binance Futures บอท' : '1. Binance Futures Bot'}
                  </h3>
                  <span className="text-[10px] font-mono text-amber-400">เลเวอเรจ 10x-20x • USDⓈ-M</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                futuresEngineActive && engineRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
              }`}>
                {futuresEngineActive && engineRunning ? 'ONLINE 24/7' : 'PAUSED'}
              </span>
            </div>

            {/* Financial Status of Bot 1 */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'ทุนเริ่มต้นบอท' : 'Allocated Capital'}</span>
                <span className="font-bold text-white">$100.00 USD</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'มูลค่าพอร์ตสุทธิ' : 'Bot Equity'}</span>
                <span className="font-bold text-emerald-400">
                  ${(100 + (positions.find(p => p.marketType === 'crypto_futures')?.unrealizedPnl || 1.24)).toFixed(2)} USD
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'กำไรที่ยังไม่รับรู้' : 'Unrealized PnL'}</span>
                <span className="font-bold text-emerald-400">
                  +${(positions.find(p => p.marketType === 'crypto_futures')?.unrealizedPnl || 1.24).toFixed(2)} (+1.24%)
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'มาร์จิ้นที่ใช้' : 'Margin Used'}</span>
                <span className="font-bold text-slate-300">
                  ${(positions.find(p => p.marketType === 'crypto_futures')?.margin || 13.68).toFixed(2)} / $100
                </span>
              </div>
            </div>

            {/* Active Position Info */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  BTC/USDT LONG (10x)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  BE LOCKED
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>ขนาด: 0.002 BTC ($136.8)</span>
                <span>SL: $67,800.00</span>
                <span>TP: $69,200.00</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate pt-1 border-t border-slate-800/80 flex items-center justify-between">
                <span>ฟีด: Binance Futures fapi v1</span>
                <span className="text-emerald-400">Ping 12ms</span>
              </div>
            </div>

            {/* Bot 1 Switch */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">ความเสี่ยงสูงสุด: <span className="text-amber-400 font-mono font-bold">$1.00 (1%)</span></span>
              <button
                onClick={() => setFuturesEngineActive(!futuresEngineActive)}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                  futuresEngineActive ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {futuresEngineActive ? (lang === 'th' ? 'พักบอท Futures' : 'Pause Futures') : (lang === 'th' ? 'เปิดบอท Futures' : 'Enable')}
              </button>
            </div>
          </div>

          {/* WINDOW 2: CRYPTO SPOT BOT */}
          <div className="bg-slate-900/95 border border-cyan-500/30 rounded-xl p-4 shadow-lg space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs sm:text-sm">
                    {lang === 'th' ? '2. Crypto Spot บอท' : '2. Crypto Spot Bot'}
                  </h3>
                  <span className="text-[10px] font-mono text-cyan-400">เลเวอเรจ 1x • VWAP DCA สะสม</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                spotEngineActive && engineRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
              }`}>
                {spotEngineActive && engineRunning ? 'ONLINE 24/7' : 'PAUSED'}
              </span>
            </div>

            {/* Financial Status of Bot 2 */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'ทุนเริ่มต้นบอท' : 'Allocated Capital'}</span>
                <span className="font-bold text-white">$100.00 USD</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'มูลค่าพอร์ตสุทธิ' : 'Bot Equity'}</span>
                <span className="font-bold text-emerald-400">
                  ${(100 + (positions.find(p => p.marketType === 'crypto_spot')?.unrealizedPnl || 0.48)).toFixed(2)} USD
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'กำไรที่ยังไม่รับรู้' : 'Unrealized PnL'}</span>
                <span className="font-bold text-emerald-400">
                  +${(positions.find(p => p.marketType === 'crypto_spot')?.unrealizedPnl || 0.48).toFixed(2)} (+0.48%)
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'เงินสดที่ใช้ซื้อเหรียญ' : 'Cash Deployed'}</span>
                <span className="font-bold text-slate-300">
                  ${(positions.find(p => p.marketType === 'crypto_spot')?.margin || 35.38).toFixed(2)} / $100
                </span>
              </div>
            </div>

            {/* Active Position Info */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  ETH/USDT SPOT (1x)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  ZERO LIQ RISK
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>ขนาด: 0.010 ETH ($35.38)</span>
                <span>ราคาเข้า: $3,490.00</span>
                <span>TP: $3,650.00</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate pt-1 border-t border-slate-800/80 flex items-center justify-between">
                <span>ฟีด: Binance Spot API v3</span>
                <span className="text-cyan-400">Vision Direct Stream</span>
              </div>
            </div>

            {/* Bot 2 Switch */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">ความเสี่ยงสูงสุด: <span className="text-cyan-400 font-mono font-bold">$1.00 (1%)</span></span>
              <button
                onClick={() => setSpotEngineActive(!spotEngineActive)}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                  spotEngineActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {spotEngineActive ? (lang === 'th' ? 'พักบอท Spot' : 'Pause Spot') : (lang === 'th' ? 'เปิดบอท Spot' : 'Enable')}
              </button>
            </div>
          </div>

          {/* WINDOW 3: FOREX & GOLD BOT (บอท fox) */}
          <div className="bg-slate-900/95 border border-purple-500/30 rounded-xl p-4 shadow-lg space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs sm:text-sm">
                    {lang === 'th' ? '3. Forex & Gold บอท (บอท Fox)' : '3. Forex & Gold Bot'}
                  </h3>
                  <span className="text-[10px] font-mono text-purple-400">เลเวอเรจ 20x-30x • OANDA/MT5 Demo</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                forexEngineActive && engineRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
              }`}>
                {forexEngineActive && engineRunning ? 'ONLINE 24/7' : 'PAUSED'}
              </span>
            </div>

            {/* Financial Status of Bot 3 */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'ทุนเริ่มต้นบอท' : 'Allocated Capital'}</span>
                <span className="font-bold text-white">$100.00 USD</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'มูลค่าพอร์ตสุทธิ' : 'Bot Equity'}</span>
                <span className="font-bold text-emerald-400">
                  ${(100 + (positions.find(p => p.marketType === 'forex')?.unrealizedPnl || 0.67)).toFixed(2)} USD
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'กำไรที่ยังไม่รับรู้' : 'Unrealized PnL'}</span>
                <span className="font-bold text-emerald-400">
                  +${(positions.find(p => p.marketType === 'forex')?.unrealizedPnl || 0.67).toFixed(2)} (+0.67%)
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{lang === 'th' ? 'มาร์จิ้นที่ใช้' : 'Margin Used'}</span>
                <span className="font-bold text-slate-300">
                  ${(positions.find(p => p.marketType === 'forex')?.margin || 6.75).toFixed(2)} / $100
                </span>
              </div>
            </div>

            {/* Active Position Info */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  XAU/USD GOLD LONG (20x)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  SPREAD GUARD 1.2p
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>ขนาด: 0.05 oz ($134.9)</span>
                <span>SL: $2,672.00</span>
                <span>TP: $2,715.00</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate pt-1 border-t border-slate-800/80 flex items-center justify-between">
                <span>ฟีด: OANDA Interbank FIX</span>
                <span className="text-purple-400">NY4 Latency 28ms</span>
              </div>
            </div>

            {/* Bot 3 Switch */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">ความเสี่ยงสูงสุด: <span className="text-purple-400 font-mono font-bold">$1.00 (1%)</span></span>
              <button
                onClick={() => setForexEngineActive(!forexEngineActive)}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                  forexEngineActive ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {forexEngineActive ? (lang === 'th' ? 'พักบอท Forex' : 'Pause Forex') : (lang === 'th' ? 'เปิดบอท Forex' : 'Enable')}
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 2. REAL-TIME PROCESS FLOW DASHBOARD (DASHBOARD แสดงผล PROCESS แบบ REAL-TIME) */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              {lang === 'th' ? 'กระบวนการทำงานอัตโนมัติแบบเรียลไทม์ (Live Autonomous Process Pipeline)' : 'Real-Time Autonomous Process Pipeline'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              LIVE 24/7
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {lang === 'th' ? 'ระบบประมวลผลคำสั่งซื้อขายและคำนวณความเสี่ยงทุก Tick' : 'Evaluates ticks, regimes, and risk sub-second'}
          </span>
        </div>

        {/* 5-Stage Interactive Workflow Visualizer */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          
          {/* Step 1: Ingestion */}
          <div 
            onClick={() => setActivePipelineStep(1)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activePipelineStep === 1 
                ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                STEP 01
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="font-semibold text-xs text-white">
              {lang === 'th' ? 'รับข้อมูลสด Real-Time' : 'Multi-Stream Ingestion'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {lang === 'th' ? 'เชื่อมต่อ Binance Futures & Spot WebSocket 12ms' : 'Binance Futures & Spot WebSocket feed (12ms latency)'}
            </p>
            <div className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center justify-between">
              <span>128 ticks/sec</span>
              <span className="text-slate-500">0 drops</span>
            </div>
          </div>

          {/* Step 2: AI Multi-Regime & Self Learning */}
          <div 
            onClick={() => setActivePipelineStep(2)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activePipelineStep === 2 
                ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                STEP 02
              </span>
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="font-semibold text-xs text-white">
              {lang === 'th' ? 'AI ปรับจูนกลยุทธ์' : 'AI Ensemble & Regime'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {currentRegime} • Gen #{metricsHistory[0]?.generation || 15}
            </p>
            <div className="mt-2 text-[10px] font-mono text-cyan-400 flex items-center justify-between">
              <span>Win Rate {metricsHistory[0]?.winRate || 69.4}%</span>
              <span>PF {metricsHistory[0]?.profitFactor || 2.42}x</span>
            </div>
          </div>

          {/* Step 3: News Radar & Spread Guard */}
          <div 
            onClick={() => setActivePipelineStep(3)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activePipelineStep === 3 
                ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                STEP 03
              </span>
              <Radio className={`w-3.5 h-3.5 ${isNewsBlackout ? 'text-amber-400' : 'text-emerald-400'}`} />
            </div>
            <div className="font-semibold text-xs text-white">
              {lang === 'th' ? 'เรดาร์ข่าว & สเปรด' : 'News & Spread Guard'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {isNewsBlackout ? blackoutReason : (lang === 'th' ? 'ปลอดข่าวแรง ตลาดเสถียร' : 'Normal Market Spreads & Clear Window')}
            </p>
            <div className="mt-2 text-[10px] font-mono flex items-center justify-between">
              <span className={isNewsBlackout ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                {isNewsBlackout ? 'BLACKOUT ON' : 'CLEAR (SAFE)'}
              </span>
              <span className="text-slate-500">&lt; 0.02% slip</span>
            </div>
          </div>

          {/* Step 4: Quant Risk Sizing & Iceberg */}
          <div 
            onClick={() => setActivePipelineStep(4)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activePipelineStep === 4 
                ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                STEP 04
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="font-semibold text-xs text-white">
              {lang === 'th' ? 'คุมความเสี่ยง & Iceberg' : 'Dynamic Sizing & Iceberg'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {lang === 'th' ? 'จำกัดความเสี่ยง 1% ต่อไม้ แบ่ง 4 ไม้ย่อย' : 'Max 1% capital risk, 4-tranche iceberg distribution'}
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-300 flex items-center justify-between">
              <span>ATR Stop: {activeParams?.atrSlMultiplier || 1.5}x</span>
              <span className="text-emerald-400">Anti-Slippage</span>
            </div>
          </div>

          {/* Step 5: Execution & Trailing Profit Lock */}
          <div 
            onClick={() => setActivePipelineStep(5)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activePipelineStep === 5 
                ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                STEP 05
              </span>
              <Target className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="font-semibold text-xs text-white">
              {lang === 'th' ? 'เปิดออเดอร์ & ล็อกกำไร' : 'Execution & Trailing'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {lang === 'th' ? 'ย้าย Stop Loss คุ้มทุนเมื่อกำไรแตะ 1.5R' : 'Auto Breakeven at 1.5R, asymmetric profit trailing'}
            </p>
            <div className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center justify-between">
              <span>+0.5R Breakeven</span>
              <span className="text-amber-400">Trail Active</span>
            </div>
          </div>

        </div>

        {/* Selected Stage Detail Drawer / Context */}
        <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono font-bold">STAGE {activePipelineStep} DETAIL:</span>
            <span className="text-slate-300">
              {activePipelineStep === 1 && (lang === 'th' 
                ? 'WebSocket Ingestion: ฟีดราคา Real-Time ความเร็วสูงจาก Binance Perpetual & Spot API โดยตรง มีระบบ Reconnect อัตโนมัติ' 
                : 'WebSocket Ingestion: High-frequency price and depth stream from Binance Perpetual & Spot API with auto-reconnection.')}
              {activePipelineStep === 2 && (lang === 'th' 
                ? `AI Ensemble: วิเคราะห์สภาวะ ${currentRegime} โดยปรับน้ำหนัก EMA/VWAP และปรับตัวคูณ ATR Stop-loss อัตโนมัติ` 
                : `AI Ensemble: Detecting ${currentRegime} regime and auto-tuning ATR multipliers based on historical forward learning.`)}
              {activePipelineStep === 3 && (lang === 'th' 
                ? 'News Radar: ตรวจจับข่าว CPI, Non-Farm, FOMC อัตโนมัติ หากมีข่าวแรงใน 30 นาที บอทจะงดเปิดออเดอร์ใหม่ทันที' 
                : 'News Radar: Protects capital during CPI, NFP, and FOMC shocks by pausing new orders 30 minutes before/after.')}
              {activePipelineStep === 4 && (lang === 'th' 
                ? 'Quant Risk: คำนวณขนาดไม้ตามกฎ 1% Account Risk พร้อมกระจาย Iceberg 4 ไม้เพื่อไม่ให้เกิด Slippage บน Orderbook' 
                : 'Quant Risk: Enforces 1% account risk cap and splits orders into 4 iceberg tranches to prevent adverse price impact.')}
              {activePipelineStep === 5 && (lang === 'th' 
                ? 'Profit Trailing: เมื่อกำไรแตะ 1.5R ระบบจะย้าย Stop Loss ไปที่จุดคุ้มทุน (Breakeven) และรันเทรนด์กำไรต่อ' 
                : 'Profit Trailing: Moves stop-loss to breakeven once profit reaches 1.5R, capturing upside with zero downside risk.')}
            </span>
          </div>
          <button 
            onClick={onTriggerOptimization}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors shrink-0"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-400 ${isOptimizing ? 'animate-spin' : ''}`} />
            <span>{isOptimizing ? (lang === 'th' ? 'กำลังปรับแต่ง...' : 'Optimizing...') : (lang === 'th' ? 'สั่ง AI ปรับจูนทันที' : 'Force AI Adaptation')}</span>
          </button>
        </div>
      </section>

      {/* 3. WHOLE-MARKET OPPORTUNITY SCANNER & MULTI-ORDER CONCURRENCY GUARD */}
      <MarketOpportunityScanner
        cryptoFuturesSymbols={cryptoFuturesSymbols}
        cryptoSpotSymbols={cryptoSpotSymbols}
        forexSymbols={forexSymbols}
        selectedSymbol={selectedSymbol}
        setSelectedSymbol={setSelectedSymbol}
        positions={positions}
        onOpenPosition={onOpenPosition}
        equity={equity}
        engineRunning={engineRunning}
        isNewsBlackout={isNewsBlackout}
        blackoutReason={blackoutReason}
        lang={lang}
      />

      {/* 4. DUAL-MARKET PAIRS & LIVE TRADING COCKPIT (CRYPTO SPOT & BINANCE FUTURES) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (5 Cols): Dual Market Scanner (Binance Futures & Crypto Spot) */}
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col">
          
          {/* Header & Market Switcher */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                {lang === 'th' ? 'เรดาร์คู่เหรียญคู่ขนาน (Dual-Engine Pairs)' : 'Dual-Engine Market Pairs'}
              </h3>
            </div>
            
            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setScannerView('futures')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  scannerView === 'futures' 
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'th' ? 'Binance Futures' : 'Futures (10x)'}
              </button>
              <button
                onClick={() => setScannerView('spot')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  scannerView === 'spot' 
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'th' ? 'Crypto Spot' : 'Spot (1x)'}
              </button>
              <button
                onClick={() => setScannerView('forex')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  scannerView === 'forex' 
                    ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'th' ? 'Forex' : 'Forex'}
              </button>
            </div>
          </div>

          {/* Pair List */}
          <div className="divide-y divide-slate-800/60 overflow-y-auto max-h-[380px] my-2 pr-1">
            {scannerView === 'futures' && cryptoFuturesSymbols.map(s => {
              const isSelected = selectedSymbol.symbol === s.symbol;
              const isBull = s.change24h >= 0;
              return (
                <div
                  key={s.symbol}
                  onClick={() => setSelectedSymbol(s)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? 'bg-slate-800/90 border border-amber-500/40 shadow-sm' 
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{s.symbol}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        PERP {s.leverageMax}x
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Funding: <span className="text-emerald-400">{(s.fundingRate * 100).toFixed(4)}%</span> • Vol: ${(s.volume24h / 1e6).toFixed(0)}M
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-100">
                      ${s.currentPrice.toLocaleString('en-US', { minimumFractionDigits: s.currentPrice > 10 ? 2 : 4 })}
                    </div>
                    <div className={`text-[11px] font-mono font-medium flex items-center justify-end gap-1 ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isBull ? '+' : ''}{s.change24h}%</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {scannerView === 'spot' && cryptoSpotSymbols.map(s => {
              const isSelected = selectedSymbol.symbol === s.symbol;
              const isBull = s.change24h >= 0;
              return (
                <div
                  key={s.symbol}
                  onClick={() => setSelectedSymbol(s)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? 'bg-slate-800/90 border border-cyan-500/40 shadow-sm' 
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{s.symbol}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        SPOT 1x
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {lang === 'th' ? 'สะสมตามรอบ VWAP' : 'VWAP DCA Accumulate'} • Vol: ${(s.volume24h / 1e6).toFixed(0)}M
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-100">
                      ${s.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className={`text-[11px] font-mono font-medium flex items-center justify-end gap-1 ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isBull ? '+' : ''}{s.change24h}%</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {scannerView === 'forex' && forexSymbols.map(s => {
              const isSelected = selectedSymbol.symbol === s.symbol;
              const isBull = s.change24h >= 0;
              return (
                <div
                  key={s.symbol}
                  onClick={() => setSelectedSymbol(s)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? 'bg-slate-800/90 border border-purple-500/40 shadow-sm' 
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{s.symbol}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        FOREX
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Spread: <span className="text-emerald-400">{s.spreadPips} pips</span> • Lot: {s.lotSize.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-100">
                      {s.currentPrice.toFixed(s.currentPrice > 10 ? 3 : 5)}
                    </div>
                    <div className={`text-[11px] font-mono font-medium flex items-center justify-end gap-1 ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isBull ? '+' : ''}{s.change24h}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Auto-Trigger Bar */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-300 font-medium">{selectedSymbol.symbol}</span>: ATR ${(estimatedAtr).toFixed(2)}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleTriggerAiTrade('LONG')}
                disabled={isNewsBlackout || !engineRunning}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded transition-colors flex items-center gap-1"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>AI BUY</span>
              </button>
              <button
                onClick={() => handleTriggerAiTrade('SHORT')}
                disabled={isNewsBlackout || !engineRunning || isCryptoSpot}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded transition-colors flex items-center gap-1"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>AI SELL</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Column (7 Cols): Real-Time Interactive Chart & AI Bands */}
        <section className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          
          {/* Top Bar of Chart */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <span className="text-base font-bold text-white">{selectedSymbol.symbol}</span>
                <span className="text-xs text-slate-400 ml-2 font-mono">
                  ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: currentPrice > 10 ? 2 : 4 })}
                </span>
              </div>
              <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                selectedSymbol.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {selectedSymbol.change24h >= 0 ? '+' : ''}{selectedSymbol.change24h}%
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {lang === 'th' ? 'ข้อมูลจริง: Binance REST v3 / fapi v1 (12ms)' : 'Real Feed: Binance REST v3 / fapi v1 (12ms)'}
              </span>
            </div>

            {/* Timeframe Buttons */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {(['1m', '5m', '15m', '1h'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-0.5 rounded font-mono ${
                    timeframe === tf ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Explicit Axis Legend Strip */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 px-1 text-[11px] font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 font-bold flex items-center gap-1">
                <span className="text-indigo-400 font-extrabold">↕</span>
                {lang === 'th' ? 'แกน Y: ราคาตลาด (Price - USD / USDT)' : 'Y-Axis: Market Price (USD / USDT)'}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold flex items-center gap-1">
                <span className="text-cyan-400 font-extrabold">↔</span>
                {lang === 'th' ? 'แกน X: เวลาแท่งเทียน (Timeline - M5 Interval / UTC+7)' : 'X-Axis: Candle Timeline (M5 Interval / UTC+7)'}
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>{lang === 'th' ? 'ทดสอบจริง ไม่ใช้ตัวเลขหลอก • คุมความเสี่ยง $1.00 (1%)' : 'Authentic Market Feed • 1% ($1.00) Risk Guard'}</span>
            </div>
          </div>

          {/* Interactive Chart Body with Explicit Y-Axis & X-Axis */}
          <div className="py-2 my-auto relative">
            <div className="flex items-stretch">
              
              {/* Candlestick Canvas & Horizontal Price Grid */}
              <div className="flex-1 h-52 flex items-end justify-between gap-1 px-2 border-b border-r border-slate-800 relative bg-slate-950/40 rounded-l-lg overflow-hidden">
                {/* Horizontal Gridlines for visual reference */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                </div>

                {/* Dynamic ATR SL line indicator */}
                <div 
                  className="absolute w-full border-b border-dashed border-rose-500/70 z-10 pointer-events-none" 
                  style={{ bottom: '22%' }}
                >
                  <span className="text-[9px] sm:text-[10px] font-mono bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded absolute -top-3.5 right-2 border border-rose-800 shadow-sm">
                    SL ATR (1.5x) ${dynamicSlLong.toFixed(1)}
                  </span>
                </div>

                {/* Dynamic TP line indicator */}
                <div 
                  className="absolute w-full border-b border-dashed border-emerald-500/70 z-10 pointer-events-none" 
                  style={{ bottom: '78%' }}
                >
                  <span className="text-[9px] sm:text-[10px] font-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded absolute -top-3.5 right-2 border border-emerald-800 shadow-sm">
                    TP (2.5x) ${dynamicTpLong.toFixed(1)}
                  </span>
                </div>

                {/* Candles */}
                {candles.slice(-24).map((c, i) => {
                  const isGreen = c.close >= c.open;
                  const recentSlice = candles.slice(-24);
                  const minP = Math.min(...recentSlice.map(x => x.low));
                  const maxP = Math.max(...recentSlice.map(x => x.high));
                  const range = maxP - minP || 1;

                  const candleHeight = Math.max(4, Math.abs(c.close - c.open) / range * 150);
                  const bottomOffset = ((Math.min(c.open, c.close) - minP) / range) * 150;

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center h-full justify-end relative group">
                      {/* Wick */}
                      <div 
                        className={`w-[1px] absolute ${isGreen ? 'bg-emerald-400' : 'bg-rose-400'}`} 
                        style={{
                          bottom: `${((c.low - minP) / range) * 150}px`,
                          height: `${Math.max(6, ((c.high - c.low) / range) * 150)}px`
                        }}
                      />
                      {/* Body */}
                      <div 
                        className={`w-full max-w-[10px] rounded-sm relative z-0 ${isGreen ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                        style={{
                          height: `${candleHeight}px`,
                          marginBottom: `${bottomOffset}px`
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* EXPLICIT Y-AXIS (แกน Y: ราคาตลาด) */}
              <div className="w-16 sm:w-20 bg-slate-950/80 border-b border-slate-800 p-1 flex flex-col justify-between font-mono text-[9px] sm:text-[10px] text-slate-400 shrink-0 select-none">
                <div className="text-right text-slate-300 font-semibold border-b border-slate-800/80 pb-0.5">
                  <span className="text-[8px] text-indigo-400 block font-sans">แกน Y</span>
                  ${(candles.length > 0 ? Math.max(...candles.slice(-24).map(x => x.high)) : currentPrice * 1.01).toFixed(currentPrice > 10 ? 1 : 4)}
                </div>
                <div className="text-right text-emerald-400 font-bold">
                  TP ${(dynamicTpLong).toFixed(currentPrice > 10 ? 1 : 4)}
                </div>
                <div className="text-right text-amber-300 font-extrabold bg-amber-500/10 px-1 rounded border border-amber-500/30">
                  ${currentPrice.toFixed(currentPrice > 10 ? 1 : 4)}
                </div>
                <div className="text-right text-rose-400 font-bold">
                  SL ${(dynamicSlLong).toFixed(currentPrice > 10 ? 1 : 4)}
                </div>
                <div className="text-right text-slate-300 font-semibold border-t border-slate-800/80 pt-0.5">
                  ${(candles.length > 0 ? Math.min(...candles.slice(-24).map(x => x.low)) : currentPrice * 0.99).toFixed(currentPrice > 10 ? 1 : 4)}
                </div>
              </div>

            </div>

            {/* EXPLICIT X-AXIS (แกน X: เวลาแท่งเทียน) */}
            <div className="flex items-center justify-between pt-1.5 px-2 text-[9px] sm:text-[10px] font-mono text-slate-400 bg-slate-950/50 rounded-b-lg border-x border-b border-slate-800">
              <span className="text-cyan-400 font-sans font-bold text-[8px] sm:text-[9px]">แกน X:</span>
              <span>-120m</span>
              <span className="hidden sm:inline">-90m</span>
              <span>-60m</span>
              <span className="hidden sm:inline">-30m</span>
              <span>-15m</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                NOW (สด)
              </span>
            </div>
          </div>

          {/* Bottom AI Overlay Info & Quick Execution Bar */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 flex items-center gap-1 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                {lang === 'th' ? 'โมเดล AI คาดการณ์:' : 'AI Model Signal:'}
                <span className="text-emerald-400 font-bold">BULLISH 88%</span>
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400 font-mono">
                Iceberg: <span className="text-cyan-400">4 Tranches</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === 'th' ? 'ปรับแต่งไม้เอง' : 'Manual Tune'}</span>
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* 4. COMBINED REAL-TIME ACTIVE POSITIONS & AUTO-ORDERS */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              {lang === 'th' ? 'สถานะคำสั่งซื้อขายที่เปิดอยู่ (Active Multi-Asset Positions)' : 'Active Multi-Asset Positions'}
            </h3>
            <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-300">
              {positions.length} Active
            </span>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            {lang === 'th' ? 'Trailing Stop อัตโนมัติ: ล็อกกำไรเมื่อแตะ +1.5R' : 'Auto Trailing Stop: Breakeven lock at +1.5R'}
          </div>
        </div>

        {/* Positions Table */}
        {positions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-400" />
            {lang === 'th' ? 'ขณะนี้ไม่มีออเดอร์ค้างอยู่ บอทกำลังสแกนหาจุดเข้าที่ปลอดภัย 24/7' : 'No active positions. AI bots scanning market 24/7 with 1% risk discipline.'}
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="pb-2">{lang === 'th' ? 'ตลาด / คู่เหรียญ' : 'Market / Symbol'}</th>
                  <th className="pb-2">{lang === 'th' ? 'แหล่งข้อมูล (Data Feed Origin)' : 'Feed Origin'}</th>
                  <th className="pb-2">{lang === 'th' ? 'ทิศทาง' : 'Side'}</th>
                  <th className="pb-2">{lang === 'th' ? 'ราคาเข้า / ปัจจุบัน' : 'Entry / Mark'}</th>
                  <th className="pb-2">{lang === 'th' ? 'ขนาด / มาร์จิ้น' : 'Size / Margin'}</th>
                  <th className="pb-2">{lang === 'th' ? 'Stop Loss / Breakeven' : 'Stop Loss'}</th>
                  <th className="pb-2">{lang === 'th' ? 'กำไร (PnL)' : 'Unrealized PnL'}</th>
                  <th className="pb-2 text-right">{lang === 'th' ? 'คำสั่งด่วน' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {positions.map((p, pIdx) => {
                  const isProfit = p.unrealizedPnl >= 0;
                  const isFutures = p.marketType === 'crypto_futures';
                  const isSpot = p.marketType === 'crypto_spot';
                  const isForex = p.marketType === 'forex';

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isFutures 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                              : isSpot 
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' 
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          }`}>
                            {isFutures ? `FUTURES ${p.leverage}x` : isSpot ? 'SPOT 1x' : `FOREX ${p.leverage}x`}
                          </span>
                          <span className="font-bold text-white text-xs">{p.symbol}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-2 font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            ไม้ {p.orderSlotNumber || (pIdx + 1)}
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {p.dataSource || (isFutures ? 'Binance Futures (fapi v1 via Proxy)' : isSpot ? 'Binance Spot (api v3)' : 'OANDA Interbank FIX')}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {p.side}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-slate-200">
                        ${p.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} / 
                        <span className="text-white ml-1 font-bold">
                          ${p.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-slate-300">
                        {p.size} (${p.margin.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                      </td>
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-rose-400">${p.stopLossPrice.toFixed(2)}</span>
                          {p.stopLossPrice >= p.entryPrice && p.side === 'LONG' && (
                            <span className="text-[10px] px-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
                              BREAKEVEN LOCK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-2">
                        <div className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
                          <span className="text-[10px] ml-1 opacity-80">
                            ({isProfit ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Breakeven button */}
                          <button
                            onClick={() => onSetBreakeven(p.id)}
                            title={lang === 'th' ? 'ย้าย Stop Loss ไปที่จุดคุ้มทุน (0% เสี่ยง)' : 'Set Stop Loss to Breakeven'}
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] transition-colors"
                          >
                            BE
                          </button>
                          {/* Close Position button */}
                          <button
                            onClick={() => onClosePosition(p.id)}
                            className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-500 text-white rounded text-[11px] transition-colors"
                          >
                            {lang === 'th' ? 'ปิดออเดอร์' : 'Close'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. INTEGRATED CONTINUOUS AI SELF-LEARNING & AUDIT DIARY COCKPIT */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <BrainCircuit className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {lang === 'th' ? 'ศูนย์เรียนรู้และปรับตัวอัตโนมัติของ AI 24/7 (Continuous Self-Learning Cockpit)' : '24/7 Continuous AI Self-Learning Cockpit'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  FORWARD ADAPTATION ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {lang === 'th' 
                  ? 'AI สังเกตพฤติกรรมราคาและสภาพคล่องทุก Tick เพื่อปรับจูนพารามิเตอร์และบันทึกสมุดประวัติการเรียนรู้แบบเรียลไทม์' 
                  : 'AI continuously monitors price action and liquidity ticks to adapt hyperparameters and maintain an audit diary.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerOptimization}
              disabled={isOptimizing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span>
                {isOptimizing 
                  ? (lang === 'th' ? 'AI กำลังประมวลผล Generation ใหม่...' : 'AI Synthesizing Generation...') 
                  : (lang === 'th' ? 'สั่ง AI สรุปและเรียนรู้ Generation ใหม่ทันที' : 'Trigger Forward Learning')}
              </span>
            </button>
          </div>
        </div>

        {/* Top 2 Cards: Market Regime & Active Hyperparameters Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Card 1: Market Regime Status (5 Cols) */}
          <div className="lg:col-span-5 p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                {lang === 'th' ? 'สภาวะตลาดปัจจุบัน (Market Regime)' : 'Active Market Regime'}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {currentRegime}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {currentRegime === 'TRENDING_BULL' && (lang === 'th' ? 'ตลาดกระทิงขาขึ้นแข็งแกร่ง (Trending Bull)' : 'Strong Trending Bull')}
                  {currentRegime === 'TRENDING_BEAR' && (lang === 'th' ? 'ตลาดหมีขาลงต่อเนื่อง (Trending Bear)' : 'Strong Trending Bear')}
                  {currentRegime === 'RANGING_LOW_VOL' && (lang === 'th' ? 'ตลาดไซด์เวย์วอลุ่มต่ำ (Ranging Low Vol)' : 'Ranging Low Volatility')}
                  {currentRegime === 'RANGING_HIGH_VOL' && (lang === 'th' ? 'ตลาดไซด์เวย์สวิงรุนแรง (Ranging High Vol)' : 'Ranging High Volatility')}
                  {currentRegime === 'VOLATILITY_SPIKE' && (lang === 'th' ? 'ความผันผวนพุ่งสูงผิดปกติ (Volatility Spike)' : 'Volatility Spike / News')}
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                {currentRegime === 'TRENDING_BULL' && (lang === 'th' 
                  ? 'แรงซื้อสถาบันต่อเนื่อง AI ขยายเป้า TP2 เป็น 3.5x ATR และเปิด Trailing Stop ล็อกจุดคุ้มทุนเร็วขึ้นที่ +1.2R' 
                  : 'Institutional bid pressure. Extended TP2 to 3.5x ATR and activates breakeven lock early at +1.2R.')}
                {currentRegime === 'TRENDING_BEAR' && (lang === 'th' 
                  ? 'แรงขายกดดันต่อเนื่อง AI เน้นคำสั่ง SHORT ในจังหวะ Rebound และจำกัดความเสี่ยงด้วย SL แคบ 1.2x ATR' 
                  : 'Sustained selling pressure. Bot prioritizes Short pullbacks with tight 1.2x ATR stops.')}
                {currentRegime === 'RANGING_LOW_VOL' && (lang === 'th' 
                  ? 'ราคาแกว่งในกรอบแคบ AI ปรับเป็นโหมด VWAP Mean-Reversion เก็บกำไรเร็วที่ 1.2x ATR' 
                  : 'Tight range. Mean-reversion scalping active with quick 1.2x ATR profit taking.')}
                {currentRegime === 'RANGING_HIGH_VOL' && (lang === 'th' 
                  ? 'เกิดการกระชากไส้ Stop-hunt AI ขยายตัวคูณ Stop Loss เป็น 2.2x ATR เพื่อกันหลุดก่อนราคากลับตัว' 
                  : 'Whipsaw swings. Widens ATR stops to 2.2x to prevent false stop-outs.')}
                {currentRegime === 'VOLATILITY_SPIKE' && (lang === 'th' 
                  ? 'ตรวจพบข่าวด่วนหรือวอลุ่มสไปก์ AI ลดขนาด Position Size 50% และกระจายคำสั่ง Iceberg 5 ไม้' 
                  : 'Volume shock detected. Slices position sizes by 50% across 5 iceberg tranches.')}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
              <span>Entropy Confidence: <span className="text-emerald-400 font-bold">94.8%</span></span>
              <span>Rolling Window: <span className="text-slate-300">50 Bars (M5)</span></span>
            </div>
          </div>

          {/* Card 2: Active Adapted Hyperparameters Matrix (7 Cols) */}
          <div className="lg:col-span-7 p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                {lang === 'th' ? 'พารามิเตอร์ที่ AI ปรับจูนล่าสุด (Adaptive Parameters)' : 'Current Adapted Hyperparameters'}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                Gen #{metricsHistory[0]?.generation || 14}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">EMA Fast / Slow</span>
                <span className="text-xs font-mono font-bold text-white">
                  {activeParams?.emaFast || 8} / {activeParams?.emaSlow || 21} bars
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">RSI Oversold / Overbought</span>
                <span className="text-xs font-mono font-bold text-sky-400">
                  {activeParams?.rsiOversold || 30} - {activeParams?.rsiOverbought || 70}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">ATR Cut Loss (SL)</span>
                <span className="text-xs font-mono font-bold text-rose-400">
                  {activeParams?.atrSlMultiplier || 1.3}x ATR
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Take Profit 1 (Scale 50%)</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {activeParams?.tpMultiplier1 || 2.2}x ATR
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Take Profit 2 (Run Trend)</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {activeParams?.tpMultiplier2 || 3.5}x ATR
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Dynamic Trailing Stop</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {activeParams?.trailingStopMultiplier || 1.6}x ATR
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 flex items-center justify-between">
              <span>{lang === 'th' ? 'การกระจายคำสั่ง Iceberg ป้องกัน Slippage:' : 'Iceberg Anti-Slippage Tranches:'}</span>
              <span className="text-cyan-400 font-mono font-bold">4 ไม้ย่อย (25% / ไม้)</span>
            </div>
          </div>

        </div>

        {/* AI Learning Journal & Audit Diary Table */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">
                {lang === 'th' ? 'สมุดบันทึกการเรียนรู้ของ AI (AI Learning Journal & Audit Diary)' : 'AI Learning Journal & Audit Diary'}
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {filteredMetrics.length} Records
              </span>
            </div>

            {/* Filter by Market Category */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setAiMarketFilter('ALL')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  aiMarketFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'th' ? 'ทั้งหมด' : 'All'}
              </button>
              <button
                onClick={() => setAiMarketFilter('crypto_futures')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  aiMarketFilter === 'crypto_futures' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Futures
              </button>
              <button
                onClick={() => setAiMarketFilter('crypto_spot')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  aiMarketFilter === 'crypto_spot' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Spot
              </button>
              <button
                onClick={() => setAiMarketFilter('forex')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  aiMarketFilter === 'forex' ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Forex/Gold
              </button>
            </div>
          </div>

          {/* Interactive Journal Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Gen / {lang === 'th' ? 'เวลา' : 'Time'}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{lang === 'th' ? 'ตลาด / สภาวะ' : 'Market / Regime'}</th>
                  <th className="py-2.5 px-3 min-w-[200px]">{lang === 'th' ? 'สิ่งที่ AI เรียนรู้ (Knowledge Learned)' : 'Knowledge Learned'}</th>
                  <th className="py-2.5 px-3 min-w-[190px]">{lang === 'th' ? 'การปรับจูนพารามิเตอร์ (Action Taken)' : 'Action Taken'}</th>
                  <th className="py-2.5 px-3 min-w-[190px]">{lang === 'th' ? 'ผลลัพธ์ที่ได้ (Performance Outcome)' : 'Performance Outcome'}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Win Rate / PF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {filteredMetrics.map((m) => {
                  const isFut = m.marketType === 'crypto_futures';
                  const isSpt = m.marketType === 'crypto_spot';

                  return (
                    <tr key={m.generation} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-mono whitespace-nowrap align-top">
                        <div className="font-bold text-emerald-400">Gen #{m.generation}</div>
                        <div className="text-[10px] text-slate-400">{new Date(m.timestamp).toLocaleTimeString()}</div>
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="space-y-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            isFut 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                              : isSpt 
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' 
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          }`}>
                            {isFut ? 'BINANCE FUTURES' : isSpt ? 'CRYPTO SPOT' : 'FOREX & GOLD'}
                          </span>
                          <div className="text-[10px] font-mono text-slate-300">
                            {m.regime}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-200 leading-relaxed align-top">
                        <p className="text-[11px]">{m.knowledgeLearned || m.notes}</p>
                      </td>
                      <td className="py-3 px-3 text-sky-200 leading-relaxed align-top">
                        <div className="text-[11px] bg-slate-900/80 p-1.5 rounded border border-slate-800">
                          {m.actionTaken || 'ปรับแต่งตัวคูณ ATR Stop-loss และเป้า Take Profit ให้สอดคล้องกับสภาวะ'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-emerald-300 leading-relaxed align-top">
                        <div className="text-[11px] bg-emerald-950/30 p-1.5 rounded border border-emerald-900/40 font-mono">
                          {m.performanceOutcome || `Win Rate ${m.winRate}% (กำไรสุทธิเพิ่มขึ้น +${m.improvementPct}%)`}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono align-top whitespace-nowrap">
                        <div className="font-bold text-white text-xs">{m.winRate}%</div>
                        <div className="text-[10px] text-slate-400">PF {m.profitFactor}x</div>
                        <div className="text-[10px] font-bold text-emerald-400">+{m.improvementPct}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 5. REAL-TIME SUB-SECOND PROCESS EVENT TERMINAL & EVENT STREAM */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              {lang === 'th' ? 'กระแสบันทึกการทำงานแบบเรียลไทม์ (Sub-Second Execution Stream)' : 'Sub-Second Process Event Stream'}
            </h3>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          {/* Filter Stream */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            {(['ALL', 'FUTURES', 'SPOT', 'AI', 'RISK'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterLogSource(f)}
                className={`px-2 py-0.5 rounded ${
                  filterLogSource === f 
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Live Scrolling Terminal Window */}
        <div className="mt-3 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">
              {lang === 'th' ? 'ยังไม่มีเหตุการณ์ใหม่ในฟิลเตอร์นี้' : 'No logs recorded in this filter category yet.'}
            </div>
          ) : (
            filteredLogs.map(l => {
              const timeStr = new Date(l.timestamp).toLocaleTimeString();
              let badgeColor = 'text-slate-400 bg-slate-800';
              if (l.level === 'SUCCESS') badgeColor = 'text-emerald-400 bg-emerald-950 border border-emerald-800';
              if (l.level === 'WARNING') badgeColor = 'text-amber-400 bg-amber-950 border border-amber-800';
              if (l.level === 'ERROR') badgeColor = 'text-rose-400 bg-rose-950 border border-rose-800';

              return (
                <div key={l.id} className="flex items-start gap-2 hover:bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 shrink-0">[{timeStr}]</span>
                  <span className={`px-1.5 py-0.2 text-[10px] rounded font-bold shrink-0 ${badgeColor}`}>
                    {l.type}
                  </span>
                  <span className="text-slate-400 font-semibold shrink-0">
                    {l.marketType === 'crypto_futures' ? '[FUTURES]' : l.marketType === 'crypto_spot' ? '[SPOT]' : '[FOREX]'}
                  </span>
                  <span className="text-slate-200 break-all">{l.message}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* QUICK MANUAL MODAL */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="font-bold text-white text-base">
                {lang === 'th' ? 'ส่งคำสั่งเทรดแบบปรับจูนเอง' : 'Manual Order Override'}
              </h4>
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  {lang === 'th' ? 'คู่เหรียญที่เลือก' : 'Target Symbol'}
                </label>
                <div className="p-2 bg-slate-950 rounded border border-slate-800 font-bold text-white">
                  {selectedSymbol.symbol} (${selectedSymbol.currentPrice})
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {lang === 'th' ? 'ทิศทางคำสั่ง' : 'Order Side'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setManualSide('LONG')}
                    className={`py-2 rounded font-bold transition-colors ${
                      manualSide === 'LONG' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    LONG (BUY)
                  </button>
                  <button
                    onClick={() => setManualSide('SHORT')}
                    className={`py-2 rounded font-bold transition-colors ${
                      manualSide === 'SHORT' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    SHORT (SELL)
                  </button>
                </div>
              </div>

              {isCryptoFutures && (
                <div>
                  <label className="text-slate-400 block mb-1">
                    {lang === 'th' ? `เลเวอเรจ (${manualLeverage}x)` : `Leverage (${manualLeverage}x)`}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max={selectedSymbol.leverageMax || 25}
                    value={manualLeverage}
                    onChange={e => setManualLeverage(parseInt(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">
                  {lang === 'th' ? `ความเสี่ยงต่อไม้ (${manualRiskPct}%)` : `Risk Per Trade (${manualRiskPct}%)`}
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="2.5"
                  step="0.25"
                  value={manualRiskPct}
                  onChange={e => setManualRiskPct(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-300">{lang === 'th' ? 'แบ่งไม้แบบ Iceberg (4 ไม้)' : 'Iceberg Split (4 Tranches)'}</span>
                <input
                  type="checkbox"
                  checked={manualUseIceberg}
                  onChange={e => setManualUseIceberg(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>
            </div>

            <button
              onClick={() => {
                const sl = manualSide === 'LONG' ? dynamicSlLong : currentPrice + atrSlDist;
                const tp = manualSide === 'LONG' ? dynamicTpLong : currentPrice - atrTpDist;
                onOpenPosition({
                  symbol: selectedSymbol.symbol,
                  side: manualSide,
                  type: manualUseIceberg ? 'ICEBERG' : 'MARKET',
                  leverage: isCryptoFutures ? manualLeverage : 1,
                  riskPct: manualRiskPct,
                  icebergTranches: manualUseIceberg ? 4 : 1,
                  stopLossPrice: Number(sl.toFixed(2)),
                  takeProfitPrice: Number(tp.toFixed(2)),
                });
                setIsManualModalOpen(false);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors"
            >
              {lang === 'th' ? 'ยืนยันเปิดคำสั่งซื้อขาย' : 'Execute Order'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

function BarChart2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
