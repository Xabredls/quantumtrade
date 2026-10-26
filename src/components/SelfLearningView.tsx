import React, { useState, useId } from 'react';
import { 
  BrainCircuit, 
  Sparkles, 
  TrendingUp, 
  RefreshCw, 
  Cpu, 
  SlidersHorizontal, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Layers,
  Plus,
  Sliders,
  Database,
  Zap,
  Target,
  Trash2,
  X
} from 'lucide-react';
import { MarketRegime, StrategyHyperparameters, getRecommendedParametersForRegime } from '../utils/tradingMath';
import { SelfLearningMetric } from '../types/trading';
import { 
  StrategyModule, 
  CustomTradingRule, 
  INITIAL_STRATEGY_MODULES, 
  INITIAL_CUSTOM_RULES,
  synthesizeEnsembleSignal
} from '../utils/aiLearningEngine';

interface SelfLearningViewProps {
  currentRegime: MarketRegime;
  activeParams: StrategyHyperparameters;
  onUpdateParams: (newParams: StrategyHyperparameters) => void;
  metricsHistory: SelfLearningMetric[];
  onTriggerOptimization: () => void;
  isOptimizing: boolean;
  lang: 'th' | 'en';
}

export const SelfLearningView: React.FC<SelfLearningViewProps> = ({
  currentRegime,
  activeParams,
  onUpdateParams,
  metricsHistory,
  onTriggerOptimization,
  isOptimizing,
  lang,
}) => {
  const [pipelineMode, setPipelineMode] = useState<'crypto_futures' | 'forex'>('crypto_futures');
  const [strategyModules, setStrategyModules] = useState<StrategyModule[]>(INITIAL_STRATEGY_MODULES);
  const [customRules, setCustomRules] = useState<CustomTradingRule[]>(INITIAL_CUSTOM_RULES);
  const [showAddRuleModal, setShowAddRuleModal] = useState<boolean>(false);

  // Form State for new custom rule
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newIndicatorA, setNewIndicatorA] = useState<'EMA_9' | 'EMA_21' | 'VWAP' | 'RSI_14' | 'ATR_14'>('RSI_14');
  const [newOperator, setNewOperator] = useState<'<' | '>' | 'CROSS_ABOVE' | 'CROSS_BELOW'>('<');
  const [newValue, setNewValue] = useState<number>(30);
  const [newDirection, setNewDirection] = useState<'LONG' | 'SHORT'>('LONG');

  const ruleNameId = useId();
  const indicatorAId = useId();
  const operatorId = useId();
  const valueId = useId();
  const directionId = useId();

  // Handle module weight slider change
  const handleWeightChange = (id: string, newWeight: number) => {
    setStrategyModules(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, weight: newWeight } : m);
      const total = updated.reduce((s, x) => s + x.weight, 0);
      return updated.map(m => ({
        ...m,
        weight: Number((m.weight / total).toFixed(3)),
      }));
    });
  };

  // Toggle active module
  const handleToggleModule = (id: string) => {
    setStrategyModules(prev => prev.map(m => m.id === id ? { ...m, active: !m.active } : m));
  };

  // Add custom rule
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName) return;

    const newRule: CustomTradingRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName,
      indicatorA: newIndicatorA,
      operator: newOperator,
      indicatorB: 'VALUE',
      value: newValue,
      signalDirection: newDirection,
      weight: 0.25,
    };

    setCustomRules(prev => [...prev, newRule]);
    setNewRuleName('');
    setShowAddRuleModal(false);
  };

  const handleRemoveRule = (id: string) => {
    setCustomRules(prev => prev.filter(r => r.id !== id));
  };

  const regimeDetails: Record<MarketRegime, { labelTh: string; labelEn: string; descTh: string; descEn: string; color: string }> = {
    TRENDING_BULL: {
      labelTh: 'แนวโน้มขาขึ้นแข็งแกร่ง (Trending Bull)',
      labelEn: 'Strong Trending Bull',
      descTh: 'แรงซื้อครอบงำตลาด บอทปรับขยาย TP ให้รันเทรนด์และใช้ Trailing Stop เพื่อเก็บกำไรสูงสุด',
      descEn: 'Bullish momentum dominates. Extended TP targets and loose trailing stop deployed.',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    },
    TRENDING_BEAR: {
      labelTh: 'แนวโน้มขาลงต่อเนื่อง (Trending Bear)',
      labelEn: 'Strong Trending Bear',
      descTh: 'แรงขายกดดันต่อเนื่อง บอทเน้นหาจังหวะ Short ในช่วง Rebound พร้อม Stop Loss แคบเพื่อกันโดนลาก',
      descEn: 'Bearish momentum. Bot prioritizes Short entries on pullbacks with tight stop losses.',
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    },
    RANGING_LOW_VOL: {
      labelTh: 'ตลาดไซด์เวย์นิ่ง วอลุ่มต่ำ (Ranging Low Vol)',
      labelEn: 'Ranging Low Volatility',
      descTh: 'ราคาเคลื่อนที่ในกรอบแคบ บอทปรับเป็นโหมด Scalping เก็บกำไรไว 1.0x ATR เพื่อไม่ให้เงินทุนแช่นาน',
      descEn: 'Tight consolidation. Scalp mode activated with quick 1.0x ATR profit taking.',
      color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
    },
    RANGING_HIGH_VOL: {
      labelTh: 'ตลาดไซด์เวย์ผันผวนสูง (Ranging High Vol)',
      labelEn: 'Ranging High Volatility',
      descTh: 'เกิดการสวิงขึ้นลงรุนแรง บอทปรับขยายระยะ Stop Loss เป็น 2.2x ATR เพื่อกันโดนล่า Stop Hunt',
      descEn: 'Whipsaw conditions. Widens SL to 2.2x ATR to prevent stop hunting before reversal.',
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    },
    NEWS_VOLATILITY: {
      labelTh: 'ความผันผวนจากข่าวแรง (News Volatility Spike)',
      labelEn: 'High News Event Spike',
      descTh: 'สเปรดถ่างและสลิปเพจสูง บอทลดขนาดไม้ลง 70% หรือหยุดรับออเดอร์ใหม่เพื่อความปลอดภัยสูงสุด',
      descEn: 'High event risk. Order sizing reduced by 70% or fully paused to prevent slippage.',
      color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    },
  };

  const currentInfo = regimeDetails[currentRegime];

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Real-Time Self-Learning Engine Status */}
      <div className="p-4 sm:p-5 lg:p-6 rounded-xl border border-slate-800 bg-slate-900/60 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {lang === 'th' ? 'ระบบ AI Trade Learning & สังเคราะห์กลยุทธ์อัตโนมัติ' : 'AI Trade Learning & Strategy Synthesis'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              {lang === 'th'
                ? 'ระบบเก็บข้อมูลจริงแบบ Forward ตลอด 24/7 เพื่อฝึกฝนและปรับปรุงกลยุทธ์ของตนเองอย่างต่อเนื่อง โดยผสมผสานกลยุทธ์หลากหลายและรองรับการสร้างสูตรการเทรดเฉพาะตัวของคุณ เพื่อกำไรในระยะยาว'
                : 'Continuously learns from real-time forward ticks across Binance Futures and Forex, evolving strategy weights and integrating custom user rules.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Dual Pipeline Switcher: Crypto vs Forex */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <button
                onClick={() => setPipelineMode('crypto_futures')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  pipelineMode === 'crypto_futures' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Binance Futures AI
              </button>
              <button
                onClick={() => setPipelineMode('forex')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  pipelineMode === 'forex' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Forex & Gold AI
              </button>
            </div>

            <button
              onClick={onTriggerOptimization}
              disabled={isOptimizing}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-all whitespace-nowrap ${
                isOptimizing
                  ? 'bg-slate-800 text-slate-500 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span>
                {isOptimizing 
                  ? (lang === 'th' ? 'กำลังคำนวณและปรับจูน...' : 'Evolving...') 
                  : (lang === 'th' ? 'สั่งเรียนรู้ข้อมูล Forward เดี๋ยวนี้' : 'Learn Forward Now')}
              </span>
            </button>
          </div>
        </div>

        {/* Forward Continuous Learning Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80 font-mono text-xs">
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'ข้อมูลจริง Forward ที่เก็บสะสม' : 'Forward Episodes'}</span>
            <span className="text-base sm:text-lg font-bold text-white tabular-nums">48,290 Ticks</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'ความแม่นยำ AI ผสมผสาน' : 'Ensemble Fitness'}</span>
            <span className="text-base sm:text-lg font-bold text-emerald-400 tabular-nums">89.4 / 100</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'โมเดลกลยุทธ์ที่กำลังทำงาน' : 'Active Modules'}</span>
            <span className="text-base sm:text-lg font-bold text-sky-400 tabular-nums">{strategyModules.filter(m => m.active).length} โมเดล</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">{lang === 'th' ? 'สถานะการเรียนรู้อัตโนมัติ' : 'Learning Loop'}</span>
            <span className="text-base sm:text-lg font-bold text-purple-400">ONLINE 24/7</span>
          </div>
        </div>
      </div>

      {/* Grid: Strategy Blender & Custom Formula Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Strategy Ensemble Blender (7 Cols) */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'th' ? 'การผสมผสานกลยุทธ์อัตโนมัติ (Strategy Blender & Ensemble)' : 'Strategy Blender & Ensemble'}</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'th' ? 'AI ปรับน้ำหนักของแต่ละกลยุทธ์อัตโนมัติตามผลกำไรจริง หรือคุณสามารถปรับค่าน้ำหนักเองได้' : 'Dynamic weights adjust based on reward signal feedback.'}
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400">Auto-Balancing</span>
          </div>

          <div className="space-y-3">
            {strategyModules.map((m) => (
              <div key={m.id} className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.active}
                      onChange={() => handleToggleModule(m.id)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                    <span className="font-bold text-white text-xs">{m.nameTh}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-400">Win: <strong className="text-emerald-400">{m.winRate}%</strong></span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">Weight: <strong className="text-sky-400">{(m.weight * 100).toFixed(0)}%</strong></span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-tight pl-6">{m.descriptionTh}</p>

                <div className="flex items-center gap-3 pl-6 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={m.weight}
                    disabled={!m.active}
                    onChange={(e) => handleWeightChange(m.id, parseFloat(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-10 text-right">
                    {(m.weight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Custom Rule Creator & Co-Evolution (5 Cols) */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-400" />
                <span>{lang === 'th' ? 'สร้างกลยุทธ์ของคุณเอง (Custom Rules)' : 'Custom Strategy Rules'}</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'th' ? 'ผสานกฎเฉพาะตัวของคุณเข้ากับระบบ AI' : 'Embed your own trading rules into the AI engine.'}
              </p>
            </div>
            
            <button
              onClick={() => setShowAddRuleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'th' ? 'เพิ่มกฎ' : 'Add Rule'}</span>
            </button>
          </div>

          {/* List of Custom Rules */}
          <div className="space-y-2.5">
            {customRules.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-slate-800 bg-slate-950 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-white block">{r.name}</span>
                  <div className="font-mono text-[11px] text-sky-400 flex items-center gap-1 flex-wrap">
                    <span>{r.indicatorA}</span>
                    <span>{r.operator}</span>
                    <span>{r.value > 0 ? r.value : r.indicatorB}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500 inline" />
                    <strong className={r.signalDirection === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>{r.signalDirection}</strong>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveRule(r.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                  title="Remove Rule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              {lang === 'th'
                ? 'ระบบ Co-Evolution: กฎที่คุณสร้างจะถูกคำนวณและปรับค่าน้ำหนักร่วมกับโมเดลหลักอัตโนมัติ โดย AI จะทดสอบกับข้อมูล Forward ทุกแท่งเทียนเพื่อรักษาประสิทธิภาพ'
                : 'Co-Evolution: Custom rules are evaluated and weight-tuned in real time alongside standard algorithmic modules.'}
            </p>
          </div>
        </div>
      </div>

      {/* Market Regime & Hyperparameters Evolution Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Market Regime Card (5 Cols) */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'th' ? 'สภาวะตลาดปัจจุบัน (Market Regime)' : 'Active Market Regime'}</span>
            </h3>
            <span className="text-xs font-mono text-emerald-400">94.2% {lang === 'th' ? 'ความมั่นใจ' : 'Confidence'}</span>
          </div>

          <div className={`p-4 rounded-xl border ${currentInfo.color} space-y-2`}>
            <div className="text-sm font-bold">
              {lang === 'th' ? currentInfo.labelTh : currentInfo.labelEn}
            </div>
            <p className="text-xs opacity-90 leading-relaxed">
              {lang === 'th' ? currentInfo.descTh : currentInfo.descEn}
            </p>
          </div>

          {/* Regime Selector Quick Simulation Buttons */}
          <div className="space-y-2 pt-2">
            <span className="text-xs text-slate-400 font-medium">
              {lang === 'th' ? 'ทดสอบการปรับแต่งกลยุทธ์ตามสภาวะต่างๆ:' : 'Simulate Strategy Reaction to Regimes:'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['TRENDING_BULL', 'TRENDING_BEAR', 'RANGING_LOW_VOL', 'RANGING_HIGH_VOL'] as MarketRegime[]).map((r) => (
                <button
                  key={r}
                  onClick={() => onUpdateParams(getRecommendedParametersForRegime(r))}
                  className={`p-2 rounded-lg text-left text-xs font-mono border transition-all ${
                    currentRegime === r
                      ? 'border-emerald-500 bg-emerald-500/10 text-white font-bold'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Hyperparameter Matrix Card (7 Cols) */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-sky-400" />
              <span>{lang === 'th' ? 'พารามิเตอร์ที่ระบบปรับแต่งอัตโนมัติ' : 'Active Adapted Hyperparameters'}</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">Gen #{metricsHistory[0]?.generation || 14}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">EMA Fast / Slow</span>
              <span className="text-sm font-mono font-bold text-white">
                {activeParams.emaFast} / {activeParams.emaSlow} bars
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">RSI Oversold / Overbought</span>
              <span className="text-sm font-mono font-bold text-sky-400">
                {activeParams.rsiOversold} - {activeParams.rsiOverbought}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">ATR Cut Loss Multiplier</span>
              <span className="text-sm font-mono font-bold text-rose-400">
                {activeParams.atrSlMultiplier}x ATR
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Take Profit 1 (Scale 50%)</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                {activeParams.tpMultiplier1}x ATR
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Take Profit 2 (Scale 30%)</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                {activeParams.tpMultiplier2}x ATR
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Trailing Stop Distance</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {activeParams.trailingStopMultiplier}x ATR
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {lang === 'th'
                ? 'คำแนะนำอัตโนมัติ: ในสภาวะตลาดปัจจุบัน ระบบขยาย Take Profit 2 ให้กว้างขึ้น และขยับ Trailing Stop ตาม ATR ล่าสุด ช่วยให้สามารถดูดซับคลื่นกำไรได้เต็มที่โดยไม่ตกรถ และตัดขาดทุนอัตโนมัติเมื่อเกิด Breakout ผิดทาง'
                : 'Automated Insight: The algorithm has expanded TP2 targets and activated dynamic chandelier trailing stop to maximize trend capture while cutting losses tightly on false breakouts.'}
            </p>
          </div>
        </div>
      </div>

      {/* Evolution History Table */}
      <div className="p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'th' ? 'ประวัติการเรียนรู้และพัฒนาของ AI (Generation Logs)' : 'Self-Learning Adaptation History'}</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {lang === 'th' ? 'อัปเดตทุก 4 ชั่วโมงหรือเมื่อความผันผวนเปลี่ยน' : 'Evaluated on rolling regime shifts'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800 bg-slate-950/60 font-mono">
              <tr>
                <th className="py-2.5 px-3">Generation</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'เวลา' : 'Timestamp'}</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'สภาวะตลาด' : 'Regime'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'th' ? 'Win Rate' : 'Win Rate'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'th' ? 'Profit Factor' : 'Profit Factor'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'th' ? 'พัฒนาการ (%)' : 'Improvement'}</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'เหตุผลในการปรับจูน' : 'Adaptation Logic'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {metricsHistory.map((m) => (
                <tr key={m.generation} className="hover:bg-slate-800/20">
                  <td className="py-3 px-3 font-bold text-emerald-400">Gen #{m.generation}</td>
                  <td className="py-3 px-3 text-slate-400">{new Date(m.timestamp).toLocaleTimeString()}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {m.regime}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-slate-200">{m.winRate}%</td>
                  <td className="py-3 px-3 text-right text-slate-200">{m.profitFactor}</td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400">+{m.improvementPct}%</td>
                  <td className="py-3 px-3 font-sans text-slate-300 text-[11px]">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Custom Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-400" />
                <span>{lang === 'th' ? 'เพิ่มกฎการเทรดเฉพาะตัว (Custom Rule)' : 'Add Custom Strategy Rule'}</span>
              </h3>
              <button 
                onClick={() => setShowAddRuleModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRule} className="space-y-3 text-xs">
              <div>
                <label htmlFor={ruleNameId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ชื่อกฎการเทรด' : 'Rule Name'}</label>
                <input
                  id={ruleNameId}
                  type="text"
                  required
                  placeholder="เช่น RSI ต่ำกว่า 25 หรือ Breakout 15m"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={indicatorAId} className="block text-slate-300 mb-1">{lang === 'th' ? 'อินดิเคเตอร์' : 'Indicator'}</label>
                  <select
                    id={indicatorAId}
                    value={newIndicatorA}
                    onChange={(e) => setNewIndicatorA(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 font-mono"
                  >
                    <option value="RSI_14">RSI (14)</option>
                    <option value="EMA_9">EMA (9)</option>
                    <option value="EMA_21">EMA (21)</option>
                    <option value="VWAP">VWAP</option>
                    <option value="ATR_14">ATR (14)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={operatorId} className="block text-slate-300 mb-1">{lang === 'th' ? 'เงื่อนไข' : 'Condition'}</label>
                  <select
                    id={operatorId}
                    value={newOperator}
                    onChange={(e) => setNewOperator(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 font-mono"
                  >
                    <option value="<">น้อยกว่า (&lt;)</option>
                    <option value=">">มากกว่า (&gt;)</option>
                    <option value="CROSS_ABOVE">ตัดขึ้น (Cross Above)</option>
                    <option value="CROSS_BELOW">ตัดลง (Cross Below)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={valueId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ค่าตัวเลข' : 'Threshold Value'}</label>
                  <input
                    id={valueId}
                    type="number"
                    value={newValue}
                    onChange={(e) => setNewValue(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label htmlFor={directionId} className="block text-slate-300 mb-1">{lang === 'th' ? 'ทิศทางสัญญาณ' : 'Signal Direction'}</label>
                  <select
                    id={directionId}
                    value={newDirection}
                    onChange={(e) => setNewDirection(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 font-mono"
                  >
                    <option value="LONG">LONG (ซื้อ)</option>
                    <option value="SHORT">SHORT (ขาย)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                >
                  {lang === 'th' ? 'บันทึกกฎ' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
