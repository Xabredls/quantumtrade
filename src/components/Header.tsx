import React from 'react';
import { 
  ShieldCheck, 
  Send, 
  CloudLightning, 
  Lock, 
  Power,
  Sliders,
  BarChart3,
  BrainCircuit,
  Radio,
  Bot,
  Layers,
  History,
  Smartphone,
  Server
} from 'lucide-react';
import { TestnetApiConfig } from '../types/trading';

interface HeaderProps {
  activeTab: 'unified_autopilot' | 'workstation' | 'self_learning' | 'news_radar' | 'multi_account' | 'backtest' | 'tailscale_mobile' | 'phase1_bots';
  setActiveTab: (tab: 'unified_autopilot' | 'workstation' | 'self_learning' | 'news_radar' | 'multi_account' | 'backtest' | 'tailscale_mobile' | 'phase1_bots') => void;
  engineRunning: boolean;
  setEngineRunning: (running: boolean) => void;
  lang: 'th' | 'en';
  setLang: (lang: 'th' | 'en') => void;
  onOpenGoogleDeploy: () => void;
  onOpenTelegram: () => void;
  onOpenSecurity: () => void;
  isPaper: boolean;
  testnetConfig?: TestnetApiConfig;
  onOpenTestnetModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  engineRunning,
  setEngineRunning,
  lang,
  setLang,
  onOpenGoogleDeploy,
  onOpenTelegram,
  onOpenSecurity,
  isPaper,
  testnetConfig,
  onOpenTestnetModal,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-8 px-4 lg:px-8">
        
        {/* Zone 1: Wordmark - Strict Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-lg">
            Q
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            QuantumTrade AI
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-4 xl:gap-5 text-xs lg:text-sm font-medium text-slate-400 overflow-x-auto min-w-0">
          <button
            onClick={() => setActiveTab('unified_autopilot')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'unified_autopilot' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lang === 'th' ? 'ศูนย์สั่งการ 24/7' : '24/7 Cockpit'}</span>
          </button>

          <button
            onClick={() => setActiveTab('workstation')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'workstation' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>{lang === 'th' ? 'เวิร์กสเตชัน' : 'Workstation'}</span>
          </button>

          <button
            onClick={() => setActiveTab('self_learning')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'self_learning' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <BrainCircuit className="w-4 h-4 shrink-0" />
            <span>{lang === 'th' ? 'AI เรียนรู้' : 'Self-Learning'}</span>
          </button>

          <button
            onClick={() => setActiveTab('news_radar')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'news_radar' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4 shrink-0" />
            <span>{lang === 'th' ? 'หลบหลีกข่าว' : 'News Radar'}</span>
          </button>

          <button
            onClick={() => setActiveTab('multi_account')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'multi_account' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>{lang === 'th' ? 'พอร์ต' : 'Portfolios'}</span>
          </button>

          <button
            onClick={() => setActiveTab('backtest')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'backtest' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>{lang === 'th' ? 'Backtest' : 'Backtest'}</span>
          </button>

          <button
            onClick={() => setActiveTab('tailscale_mobile')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'tailscale_mobile' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lang === 'th' ? 'Tailscale' : 'Tailscale'}</span>
          </button>

          <button
            onClick={() => setActiveTab('phase1_bots')}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'phase1_bots' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Phase 1</span>
          </button>
        </nav>

        {/* Zone 3: Quick Action Tools & Engine Control */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Testnet / Demo / Live Selector Badge */}
          <button
            onClick={onOpenTestnetModal}
            title={lang === 'th' ? 'คลิกเพื่อเปลี่ยนโหมด Testnet / Demo API' : 'Click to configure Testnet/Demo API'}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-mono font-medium border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <Server className="w-3 h-3 text-sky-400" />
            <span className="uppercase font-semibold truncate max-w-[90px] sm:max-w-none">
              {testnetConfig?.environment === 'binance_testnet' 
                ? 'BINANCE TESTNET' 
                : testnetConfig?.environment === 'binance_spot_testnet'
                ? 'SPOT TESTNET'
                : testnetConfig?.environment === 'oanda_demo'
                ? 'OANDA DEMO'
                : testnetConfig?.environment === 'paper'
                ? 'PAPER SIM'
                : 'LIVE API'}
            </span>
          </button>

          {/* Google Free Tier 1-Click Setup */}
          <button
            onClick={onOpenGoogleDeploy}
            title={lang === 'th' ? 'ติดตั้งบน Google Cloud Free Tier 24/7' : 'Google Free Tier 24/7 Setup'}
            className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <CloudLightning className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden lg:inline">{lang === 'th' ? 'Google Free Tier' : 'Google Free Tier'}</span>
          </button>

          {/* Telegram Alerts Setup */}
          <button
            onClick={onOpenTelegram}
            title={lang === 'th' ? 'ตั้งค่าการแจ้งเตือน Telegram Bot' : 'Telegram Alerts'}
            className="p-1.5 text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4 text-sky-400" />
          </button>

          {/* Security Vault & Backups */}
          <button
            onClick={onOpenSecurity}
            title={lang === 'th' ? 'ความปลอดภัย & สำรองข้อมูลรายวัน' : 'Security Vault & Backups'}
            className="p-1.5 text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
          >
            <Lock className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="px-2 py-1 text-xs font-mono text-slate-400 hover:text-slate-200 border border-slate-800 rounded-md bg-slate-900 transition-colors"
          >
            {lang.toUpperCase()}
          </button>

          {/* Engine Master Kill Switch / Run Toggle */}
          <button
            onClick={() => setEngineRunning(!engineRunning)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              engineRunning 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' 
                : 'bg-rose-600/90 hover:bg-rose-500 text-white'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{engineRunning ? (lang === 'th' ? 'บอทกำลังรัน 24/7' : 'ENGINE ACTIVE') : (lang === 'th' ? 'บอทหยุดทำงาน' : 'ENGINE PAUSED')}</span>
            <span className="sm:hidden">{engineRunning ? '24/7' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Subnav Strip */}
      <div className="flex md:hidden items-center justify-around border-t border-slate-800/80 bg-slate-950 px-1 py-2 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('unified_autopilot')}
          className={`px-2 py-1 rounded whitespace-nowrap font-mono ${activeTab === 'unified_autopilot' ? 'text-emerald-400 font-bold bg-emerald-500/10' : 'text-slate-400'}`}
        >
          {lang === 'th' ? '⚡บอท 24/7' : '⚡24/7 Auto'}
        </button>
        <button
          onClick={() => setActiveTab('workstation')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'workstation' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          {lang === 'th' ? 'เทรด' : 'Trade'}
        </button>
        <button
          onClick={() => setActiveTab('self_learning')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'self_learning' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          {lang === 'th' ? 'AI เรียนรู้' : 'AI Learn'}
        </button>
        <button
          onClick={() => setActiveTab('news_radar')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'news_radar' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          {lang === 'th' ? 'หลบข่าว' : 'News'}
        </button>
        <button
          onClick={() => setActiveTab('multi_account')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'multi_account' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          {lang === 'th' ? 'พอร์ต' : 'Portfolios'}
        </button>
        <button
          onClick={() => setActiveTab('backtest')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'backtest' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          {lang === 'th' ? 'Backtest' : 'Backtest'}
        </button>
        <button
          onClick={() => setActiveTab('tailscale_mobile')}
          className={`px-2 py-1 rounded whitespace-nowrap font-mono ${activeTab === 'tailscale_mobile' ? 'text-emerald-400 font-bold bg-emerald-500/10' : 'text-slate-400'}`}
        >
          {lang === 'th' ? '📱มือถือ' : '📱Mobile'}
        </button>
        <button
          onClick={() => setActiveTab('phase1_bots')}
          className={`px-2 py-1 rounded whitespace-nowrap ${activeTab === 'phase1_bots' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          Phase 1
        </button>
      </div>
    </header>
  );
};
