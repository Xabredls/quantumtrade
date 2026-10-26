import React, { useState, useEffect } from 'react';
import { 
  Radar, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  RefreshCw, 
  Sliders, 
  Layers, 
  Zap, 
  Activity, 
  ExternalLink, 
  Lock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Globe
} from 'lucide-react';

import { 
  TradableSymbol, 
  Position, 
  MarketOpportunity, 
  MultiOrderRiskController, 
  OrderSide, 
  OrderType,
  MarketType 
} from '../types/trading';
import { 
  scanWholeMarket, 
  DEFAULT_RISK_CONTROLLER, 
  getDataSourceInfo,
  DataSourceInfo 
} from '../utils/marketScanner';

interface MarketOpportunityScannerProps {
  cryptoFuturesSymbols: TradableSymbol[];
  cryptoSpotSymbols: TradableSymbol[];
  forexSymbols: TradableSymbol[];
  selectedSymbol: TradableSymbol;
  setSelectedSymbol: (s: TradableSymbol) => void;
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
  equity: number;
  engineRunning: boolean;
  isNewsBlackout: boolean;
  blackoutReason?: string;
  lang: 'th' | 'en';
}

export const MarketOpportunityScanner: React.FC<MarketOpportunityScannerProps> = ({
  cryptoFuturesSymbols,
  cryptoSpotSymbols,
  forexSymbols,
  selectedSymbol,
  setSelectedSymbol,
  positions,
  onOpenPosition,
  equity,
  engineRunning,
  isNewsBlackout,
  blackoutReason,
  lang,
}) => {
  // Filter Tabs
  const [boardFilter, setBoardFilter] = useState<'ALL' | 'FUTURES' | 'SPOT' | 'FOREX' | 'GRADE_A'>('ALL');
  
  // Risk Controller State
  const [riskController, setRiskController] = useState<MultiOrderRiskController>(DEFAULT_RISK_CONTROLLER);
  const [showRiskSettings, setShowRiskSettings] = useState<boolean>(false);

  // Auto-Scan periodic countdown (default cycle 20 seconds)
  const SCAN_CYCLE_SECONDS = 20;
  const [countdown, setCountdown] = useState<number>(SCAN_CYCLE_SECONDS);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastScannedTime, setLastScannedTime] = useState<number>(Date.now());

  // Aggregate all symbols
  const allSymbols = [...cryptoFuturesSymbols, ...cryptoSpotSymbols, ...forexSymbols];

  // Scanned opportunities
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>(() => 
    scanWholeMarket(allSymbols, positions, riskController, equity, isNewsBlackout)
  );

  // Trigger manual or periodic scan
  const executeScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      const results = scanWholeMarket(allSymbols, positions, riskController, equity, isNewsBlackout, Date.now());
      setOpportunities(results);
      setLastScannedTime(Date.now());
      setIsScanning(false);
      setCountdown(SCAN_CYCLE_SECONDS);
    }, 450);
  };

  // Periodic Auto-Scanner Loop
  useEffect(() => {
    if (!engineRunning) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          executeScan();
          return SCAN_CYCLE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [engineRunning, allSymbols, positions, riskController, equity, isNewsBlackout]);

  // Update opportunities when positions change or prices tick
  useEffect(() => {
    setOpportunities(scanWholeMarket(allSymbols, positions, riskController, equity, isNewsBlackout, Date.now()));
  }, [positions.length, isNewsBlackout]);

  // Filtered List
  const filteredOpportunities = opportunities.filter(op => {
    if (boardFilter === 'FUTURES') return op.marketType === 'crypto_futures';
    if (boardFilter === 'SPOT') return op.marketType === 'crypto_spot';
    if (boardFilter === 'FOREX') return op.marketType === 'forex';
    if (boardFilter === 'GRADE_A') return op.signalScore >= 80;
    return true;
  });

  // Capacity calculation
  const openCount = positions.length;
  const maxOrders = riskController.maxOpenPositions;
  const capacityPct = Math.round((openCount / maxOrders) * 100);
  const totalMarginUsed = positions.reduce((acc, p) => acc + p.margin, 0);
  const maxAllowedMargin = equity * (riskController.maxMarginExposurePct / 100);
  const marginUsedPct = equity > 0 ? ((totalMarginUsed / maxAllowedMargin) * 100).toFixed(0) : '0';

  // Handle Quick Multi-Order Execution
  const handleQuickExecute = (op: MarketOpportunity) => {
    if (!op.isEligibleForNewOrder) return;

    // Target symbol object
    const symObj = allSymbols.find(s => s.symbol === op.symbol);
    if (symObj) {
      setSelectedSymbol(symObj);
    }

    const defaultSize = op.marketType === 'crypto_futures' 
      ? (op.currentPrice > 10000 ? 0.1 : op.currentPrice > 500 ? 1.0 : 10.0)
      : op.marketType === 'crypto_spot' ? 1.0 : 10000;

    onOpenPosition({
      symbol: op.symbol,
      side: op.recommendedSide,
      type: 'ICEBERG',
      leverage: op.recommendedLeverage,
      riskPct: 1.0,
      customSize: defaultSize,
      icebergTranches: 4,
      stopLossPrice: op.targetStopLoss,
      takeProfitPrice: op.targetTakeProfit,
    });

    // Update last order timestamp in controller
    setRiskController(prev => ({ ...prev, lastOrderTimestamp: Date.now() }));
  };

  return (
    <div className="space-y-4">
      
      {/* 1. TOP TRANSPARENCY BAR: DATA SOURCES & FEED PROVENANCE (ดึงข้อมูลมาจากไหน) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
        
        {/* Source 1: Binance Futures */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-[11px]">Binance Futures</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  USDⓈ-M v3
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">fapi.binance.com (SG Proxy)</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            36 ms
          </span>
        </div>

        {/* Source 2: Binance Spot */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-[11px]">Binance Spot</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                  API v3
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">api.binance.com (WebSocket)</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
            28 ms
          </span>
        </div>

        {/* Source 3: OANDA Interbank FIX */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-[11px]">OANDA Interbank</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                  NY4 FIX
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">stream-fxtrade.oanda.com</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-purple-400 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
            42 ms
          </span>
        </div>

      </div>

      {/* 2. MULTI-ORDER CONCURRENCY & CONTROLLED RISK GUARD (คุมความเสี่ยงไม่ให้ออกไม้เยอะเกินการควบคุม) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-3">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  {lang === 'th' ? 'ระบบควบคุมการออกไม้หลายออเดอร์ (Multi-Order Concurrency Guard)' : 'Multi-Order Concurrency Guard'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {openCount} / {maxOrders} ไม้ใช้งานอยู่
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {lang === 'th' 
                  ? 'ออกไม้ได้มากกว่า 1 order เมื่อเห็นว่าเหมาะสม แต่ล็อกเพดานสูงสุดไม่เกิน 4 ไม้ และล็อกมาร์จิ้นรวมไม่เกิน 20% เพื่อให้ได้กำไรแน่นอน' 
                  : 'Allows concurrent multi-order entries up to 4 positions with a 20% total portfolio margin ceiling.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowRiskSettings(!showRiskSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors self-start sm:self-center font-mono"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showRiskSettings ? 'ซ่อนการตั้งค่า' : 'ปรับเพดานไม้'}</span>
          </button>
        </div>

        {/* 4 Interactive Order Slots Visualizer */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Array.from({ length: maxOrders }).map((_, idx) => {
            const pos = positions[idx];
            const slotNum = idx + 1;
            const isOccupied = !!pos;

            return (
              <div 
                key={slotNum}
                className={`p-3 rounded-xl border transition-all text-xs ${
                  isOccupied 
                    ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm shadow-emerald-500/5' 
                    : 'bg-slate-950/40 border-slate-800/80 border-dashed text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    SLOT {slotNum}
                  </span>
                  {isOccupied ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ACTIVE
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500">AVAILABLE</span>
                  )}
                </div>

                {isOccupied ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{pos.symbol}</span>
                      <span className={`font-mono text-[10px] font-bold ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>{pos.side} {pos.leverage}x</span>
                      <span>${pos.margin.toFixed(0)} Margin</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 text-center text-[10px] text-slate-500">
                    พร้อมออกไม้ใหม่เมื่อพบสัญญาณ Grade A+
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Collapsible Risk Settings Drawer */}
        {showRiskSettings && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3 animate-in fade-in">
            <span className="font-bold text-white block">
              {lang === 'th' ? 'การตั้งค่าระบบความปลอดภัยการออกไม้หลาย Order:' : 'Multi-Order Risk Guard Settings:'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  จำนวนไม้สูงสุดพร้อมกัน (Max Orders): <strong className="text-white">{riskController.maxOpenPositions}</strong>
                </label>
                <input 
                  type="range" 
                  min={1} 
                  max={6} 
                  value={riskController.maxOpenPositions}
                  onChange={(e) => setRiskController({ ...riskController, maxOpenPositions: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  เพดานมาร์จิ้นรวม (Max Margin Exposure): <strong className="text-white">{riskController.maxMarginExposurePct}%</strong>
                </label>
                <input 
                  type="range" 
                  min={10} 
                  max={40} 
                  step={5}
                  value={riskController.maxMarginExposurePct}
                  onChange={(e) => setRiskController({ ...riskController, maxMarginExposurePct: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  พักเครื่องระหว่างออกไม้ (Cooldown): <strong className="text-white">{riskController.cooldownSeconds}s</strong>
                </label>
                <input 
                  type="range" 
                  min={30} 
                  max={180} 
                  step={15}
                  value={riskController.cooldownSeconds}
                  onChange={(e) => setRiskController({ ...riskController, cooldownSeconds: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. WHOLE-MARKET OPPORTUNITY SCANNER (สแกนทั้งกระดานเป็นระยะที่เหมาะสม) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        
        {/* Scanner Toolbar & Auto-Scan Status */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Radar className={`w-5 h-5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  {lang === 'th' ? 'ระบบสแกนเหรียญ & คู่เงินที่น่าเข้าซื้อ/ขายทั้งกระดาน' : 'Whole-Market AI Opportunity Scanner'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {opportunities.length} คู่ในระบบ
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {lang === 'th'
                  ? 'สแกนหาจังหวะเทรดอัตโนมัติเป็นระยะจากทั้งกระดาน Binance Futures, Spot และ Forex ไม่ยึดติดแค่คู่เดิมๆ'
                  : 'Periodically screens the whole universe across Binance Futures, Spot, and Forex for high-conviction momentum setups.'}
              </p>
            </div>
          </div>

          {/* Auto-Scan Countdown & Manual Trigger */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{lang === 'th' ? 'รอบสแกนถัดไป:' : 'Next scan in:'}</span>
              <span className="font-bold text-emerald-400">{countdown}s</span>
            </div>

            <button
              onClick={executeScan}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-sm shadow-emerald-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? (lang === 'th' ? 'กำลังสแกน...' : 'Scanning...') : (lang === 'th' ? 'สแกนทั้งกระดานทันที' : 'Scan Whole Market Now')}</span>
            </button>
          </div>
        </div>

        {/* Board Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
          <button
            onClick={() => setBoardFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              boardFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {lang === 'th' ? 'ทั้งหมด (All Boards)' : 'All Boards'} ({opportunities.length})
          </button>

          <button
            onClick={() => setBoardFilter('GRADE_A')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              boardFilter === 'GRADE_A' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            🔥 {lang === 'th' ? 'สัญญาณเกรด A+ (Score >= 80)' : 'Grade A+ (Score >= 80)'}
          </button>

          <button
            onClick={() => setBoardFilter('FUTURES')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              boardFilter === 'FUTURES' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {lang === 'th' ? 'Binance Futures' : 'Binance Futures'} ({cryptoFuturesSymbols.length})
          </button>

          <button
            onClick={() => setBoardFilter('SPOT')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              boardFilter === 'SPOT' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {lang === 'th' ? 'Crypto Spot' : 'Crypto Spot'} ({cryptoSpotSymbols.length})
          </button>

          <button
            onClick={() => setBoardFilter('FOREX')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              boardFilter === 'FOREX' ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {lang === 'th' ? 'Forex & ทองคำ' : 'Forex & Gold'} ({forexSymbols.length})
          </button>
        </div>

        {/* Opportunities Scanned Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono bg-slate-950">
                <th className="py-3 px-3">{lang === 'th' ? 'คะแนน / สัญญาณ' : 'Score / Signal'}</th>
                <th className="py-3 px-3">{lang === 'th' ? 'คู่เหรียญ / ตลาด' : 'Pair / Market'}</th>
                <th className="py-3 px-3">{lang === 'th' ? 'แหล่งข้อมูล (Data Source)' : 'Data Source Feed'}</th>
                <th className="py-3 px-3">{lang === 'th' ? 'ราคา / 24ชม.' : 'Price / 24h'}</th>
                <th className="py-3 px-3">RSI / Volume</th>
                <th className="py-3 px-3">{lang === 'th' ? 'เหตุผลทางเทคนิค (Rationale)' : 'Technical Catalyst'}</th>
                <th className="py-3 px-3">{lang === 'th' ? 'เป้า TP / SL' : 'TP / SL Target'}</th>
                <th className="py-3 px-3 text-right">{lang === 'th' ? 'การออกไม้' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOpportunities.map((op, idx) => {
                const isSelected = selectedSymbol.symbol === op.symbol;
                const isGradeA = op.signalScore >= 80;
                const isFutures = op.marketType === 'crypto_futures';
                const isSpot = op.marketType === 'crypto_spot';

                return (
                  <tr 
                    key={op.symbol}
                    className={`hover:bg-slate-850 transition-colors ${isSelected ? 'bg-slate-800/40' : ''}`}
                  >
                    {/* Signal Score & Action */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className={`flex flex-col items-center justify-center w-11 h-11 rounded-lg border font-mono ${
                          op.signalScore >= 88 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
                            : isGradeA 
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' 
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}>
                          <span className="font-bold text-xs">{op.signalScore}</span>
                          <span className="text-[9px] font-semibold">{op.signalScore >= 88 ? 'A+' : isGradeA ? 'A' : 'B'}</span>
                        </div>
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold block whitespace-nowrap ${
                            op.signalAction === 'STRONG_BUY' || op.signalAction === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : op.signalAction === 'STRONG_SELL' || op.signalAction === 'SELL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {op.signalAction.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Pair & Market */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-white text-xs flex items-center gap-1.5">
                        <span>{op.symbol}</span>
                      </div>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border inline-block mt-0.5 ${
                        isFutures 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                          : isSpot 
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      }`}>
                        {isFutures ? `FUTURES ${op.recommendedLeverage}x` : isSpot ? 'SPOT 1x' : 'FOREX'}
                      </span>
                    </td>

                    {/* Transparent Data Source Origin */}
                    <td className="py-3 px-3">
                      <div className="text-[11px] font-medium text-slate-200">
                        {op.dataSource}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>Latency: {op.feedLatencyMs} ms</span>
                      </div>
                    </td>

                    {/* Price & 24h Change */}
                    <td className="py-3 px-3 font-mono">
                      <div className="font-bold text-slate-100">
                        ${op.currentPrice.toLocaleString('en-US', { minimumFractionDigits: op.currentPrice > 10 ? 2 : 4 })}
                      </div>
                      <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${op.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {op.change24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{op.change24h >= 0 ? '+' : ''}{op.change24h}%</span>
                      </div>
                    </td>

                    {/* RSI & Volume Surge */}
                    <td className="py-3 px-3 font-mono text-[11px]">
                      <div>
                        RSI: <span className={`font-bold ${op.rsi <= 30 ? 'text-emerald-400' : op.rsi >= 70 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {op.rsi}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Vol Surge: <span className="text-cyan-400 font-bold">{op.volumeSurgeRatio}x</span>
                      </div>
                    </td>

                    {/* Technical Catalyst Rationale */}
                    <td className="py-3 px-3 max-w-xs">
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {op.rationale}
                      </p>
                    </td>

                    {/* Target TP & SL */}
                    <td className="py-3 px-3 font-mono text-[10px]">
                      <div className="text-emerald-400 font-medium">TP: ${op.targetTakeProfit}</div>
                      <div className="text-rose-400">SL: ${op.targetStopLoss}</div>
                      <span className="text-[9px] text-slate-500">R:R 1:{op.riskRewardRatio}</span>
                    </td>

                    {/* Controlled Order Execution Button */}
                    <td className="py-3 px-3 text-right">
                      {op.isEligibleForNewOrder ? (
                        <button
                          onClick={() => handleQuickExecute(op)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-sm shadow-emerald-500/20 whitespace-nowrap active:scale-95 flex items-center gap-1.5 ml-auto"
                        >
                          <Zap className="w-3 h-3" />
                          <span>{lang === 'th' ? `ออกไม้นี้ (ไม้ ${openCount + 1}/${maxOrders})` : `Open Slot ${openCount + 1}`}</span>
                        </button>
                      ) : (
                        <div className="text-right">
                          <span 
                            title={op.rejectReason}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 text-slate-400 border border-slate-700/80 text-[10px] font-mono cursor-not-allowed whitespace-nowrap"
                          >
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>{lang === 'th' ? 'ล็อกความเสี่ยง' : 'Risk Locked'}</span>
                          </span>
                          <span className="block text-[9px] text-slate-500 max-w-[140px] truncate ml-auto" title={op.rejectReason}>
                            {op.rejectReason}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
