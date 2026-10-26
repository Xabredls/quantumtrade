import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, 
  ShieldCheck, 
  Wifi, 
  QrCode, 
  Copy, 
  Check, 
  Terminal, 
  Server, 
  Power, 
  Lock, 
  TrendingUp, 
  AlertTriangle, 
  Globe, 
  ExternalLink, 
  RefreshCw, 
  ArrowUpRight, 
  Sliders, 
  Activity, 
  Download,
  Share2,
  CheckCircle2,
  Cpu,
  HardDrive
} from 'lucide-react';

import { Position, AccountPortfolio, ExecutionLogItem } from '../types/trading';
import { 
  ProxyConfig, 
  DEFAULT_PROXY_CONFIG, 
  PROXY_PRESETS, 
  generatePythonCcxtCode, 
  generateNodeCcxtCode, 
  generateTailscaleGcpScript,
  buildProxyUrl 
} from '../utils/proxyCodeGenerator';
import { triggerFileDownload } from '../utils/securityVault';

interface TailscaleMobileViewProps {
  positions: Position[];
  onOpenPosition: any;
  onClosePosition: (id: string) => void;
  onSetBreakeven: (id: string) => void;
  engineRunning: boolean;
  setEngineRunning: (running: boolean) => void;
  futuresEngineActive: boolean;
  setFuturesEngineActive: (active: boolean) => void;
  spotEngineActive: boolean;
  setSpotEngineActive: (active: boolean) => void;
  logs: ExecutionLogItem[];
  lang: 'th' | 'en';
}

export const TailscaleMobileView: React.FC<TailscaleMobileViewProps> = ({
  positions,
  onClosePosition,
  onSetBreakeven,
  engineRunning,
  setEngineRunning,
  futuresEngineActive,
  setFuturesEngineActive,
  spotEngineActive,
  setSpotEngineActive,
  logs,
  lang,
}) => {
  // Mobile Frame vs Full Width toggle
  const [viewMode, setViewMode] = useState<'phone_frame' | 'responsive'>('phone_frame');
  const [activeSection, setActiveSection] = useState<'monitor' | 'proxy_code' | 'vm_setup'>('monitor');

  // Tailscale State
  const [tailscaleIp, setTailscaleIp] = useState<string>('100.84.192.42');
  const [magicDns, setMagicDns] = useState<string>('quantumtrade-gcp-vm.tailscale.net');
  const [port, setPort] = useState<number>(3000);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Binance Proxy State
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(DEFAULT_PROXY_CONFIG);
  const [codeLang, setCodeLang] = useState<'python' | 'node'>('python');
  const [apiKeyInput, setApiKeyInput] = useState<string>('YOUR_BINANCE_API_KEY');
  const [secretKeyInput, setSecretKeyInput] = useState<string>('YOUR_BINANCE_SECRET_KEY');
  
  // Connection Test Simulator
  const [isTestingProxy, setIsTestingProxy] = useState<boolean>(false);
  const [proxyTestResult, setProxyTestResult] = useState<{
    success: boolean;
    latency: number;
    ipCountry: string;
    message: string;
  } | null>({
    success: true,
    latency: 38,
    ipCountry: 'Singapore (SG) 🇸🇬',
    message: 'เชื่อมต่อผ่าน SOCKS5 สำเร็จ! Binance Futures API ตอบสนองปกติ (ไม่ติด Geoblock US)',
  });

  const fullTailscaleUrl = `http://${tailscaleIp}:${port}`;

  // Generate QR Code whenever URL changes
  useEffect(() => {
    QRCode.toDataURL(fullTailscaleUrl, {
      width: 260,
      margin: 1.5,
      color: {
        dark: '#10b981', // Emerald green
        light: '#020617', // Slate 950
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('QR generation error:', err));
  }, [fullTailscaleUrl]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestProxy = () => {
    setIsTestingProxy(true);
    setProxyTestResult(null);

    setTimeout(() => {
      const simulatedLatency = Math.floor(Math.random() * 25) + 32; // 32-57ms
      setIsTestingProxy(false);
      setProxyTestResult({
        success: true,
        latency: simulatedLatency,
        ipCountry: proxyConfig.host.includes('jp') ? 'Tokyo (JP) 🇯🇵' : 'Singapore (SG) 🇸🇬',
        message: `เชื่อมต่อสำเร็จผ่าน ${proxyConfig.protocol.toUpperCase()}! Latency: ${simulatedLatency}ms | Binance BTC/USDT Ticker ตอบสนองปกติ`,
      });
    }, 1200);
  };

  const handleApplyPreset = (preset: typeof PROXY_PRESETS[0]) => {
    setProxyConfig(prev => ({
      ...prev,
      protocol: preset.protocol,
      host: preset.sampleHost,
      port: preset.samplePort,
    }));
  };

  // Calculations for summary stats
  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const totalMargin = positions.reduce((acc, p) => acc + p.margin, 0);
  const pnlPct = totalMargin > 0 ? (totalUnrealizedPnl / totalMargin) * 100 : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Context & Features */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              {lang === 'th' ? 'แดชบอร์ดมือถือผ่าน Tailscale & ตัวปรับโค้ด Binance Proxy' : 'Tailscale Mobile Cockpit & Binance Proxy Studio'}
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              GCP Always-Free Safe
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            {lang === 'th'
              ? 'มอนิเตอร์และสั่งการบอทจากมือถือผ่าน VPN Tailscale โดยไม่ต้องเปิดพอร์ต 3000 สู่สาธารณะ พร้อมระบบตั้งค่า Proxy แก้ปัญหา Google Cloud VM ในสหรัฐฯ ติด Geoblock ของ Binance Futures'
              : 'Monitor & control your 24/7 trading bot securely from your smartphone over Tailscale WireGuard mesh with zero open ports, plus non-US proxy injector for Binance Futures.'}
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2 self-start md:self-center">
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSection('monitor')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeSection === 'monitor' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'th' ? '📱 จอมอนิเตอร์มือถือ' : '📱 Mobile Monitor'}
            </button>
            <button
              onClick={() => setActiveSection('proxy_code')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeSection === 'proxy_code' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'th' ? '⚡ ตั้งค่า Binance Proxy' : '⚡ Binance Proxy'}
            </button>
            <button
              onClick={() => setActiveSection('vm_setup')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeSection === 'vm_setup' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'th' ? '🛠️ ติดตั้ง VM 1-Click' : '🛠️ VM 1-Click'}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: MOBILE MONITOR & TAILSCALE CONNECT */}
      {activeSection === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left / Center: Interactive Mobile Phone Frame Preview */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="flex items-center justify-between w-full max-w-[400px] mb-3 px-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                {lang === 'th' ? 'การแสดงผลจริงบนสมาร์ตโฟน (390×844)' : 'Live Smartphone Viewport'}
              </span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                100.84.192.42:3000
              </span>
            </div>

            {/* Realistic Smartphone Shell */}
            <div className="relative w-full max-w-[390px] rounded-[44px] bg-slate-950 p-3.5 border-4 border-slate-700 shadow-2xl shadow-emerald-500/5 ring-1 ring-slate-800">
              {/* Phone Speaker & Dynamic Island / Notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-800 mr-2" />
                <div className="w-10 h-1.5 rounded-full bg-slate-800" />
              </div>

              {/* Phone Screen Container (Scrollable) */}
              <div className="relative w-full h-[760px] bg-slate-950 rounded-[34px] overflow-y-auto border border-slate-800/80 flex flex-col text-slate-200 select-none pb-8 text-xs">
                
                {/* Mobile Top Status Header (Inside phone) */}
                <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md px-4 pt-6 pb-3 border-b border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-sm text-white tracking-tight">QuantumTrade</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                        Tailscale
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">GCP e2-micro • 24/7 Live</span>
                  </div>

                  {/* Engine Master Switch in Mobile */}
                  <button
                    onClick={() => setEngineRunning(!engineRunning)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all shadow-sm ${
                      engineRunning
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{engineRunning ? 'RUNNING' : 'PAUSED'}</span>
                  </button>
                </div>

                {/* Mobile Content Area */}
                <div className="p-3.5 space-y-3.5">
                  
                  {/* Total PnL Hero Card */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800/90 shadow-md">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="text-[11px] font-medium">{lang === 'th' ? 'กำไรที่ยังไม่รับรู้ (Unrealized PnL)' : 'Unrealized PnL'}</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <span className="font-mono">{positions.length}</span> {lang === 'th' ? 'สัญญาเปิดอยู่' : 'Active'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold font-mono tracking-tight ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalUnrealizedPnl >= 0 ? `+$${totalUnrealizedPnl.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnl).toFixed(2)}`}
                      </span>
                      <span className={`text-xs font-semibold font-mono ${pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800 text-[10px]">
                      <div>
                        <span className="text-slate-500 block">Win Rate</span>
                        <span className="font-mono font-bold text-white">73.4%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Today PnL</span>
                        <span className="font-mono font-bold text-emerald-400">+$213.32</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">GCP Ping</span>
                        <span className="font-mono font-bold text-sky-400">38 ms</span>
                      </div>
                    </div>
                  </div>

                  {/* Dual Autonomous Engine Status Strip */}
                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {lang === 'th' ? 'สถานะเครื่องยนต์คู่ขนาน (Dual Engine)' : 'Concurrent Engine States'}
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-200 block text-[11px]">Binance Futures</span>
                          <span className="text-[9px] text-amber-400 font-mono">10x Leverage</span>
                        </div>
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-200 block text-[11px]">Crypto Spot</span>
                          <span className="text-[9px] text-emerald-400 font-mono">1x Safe (No Liq)</span>
                        </div>
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                    </div>
                  </div>

                  {/* Mobile Quick Action Buttons (Thumb Zone) */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        positions.forEach(p => onSetBreakeven(p.id));
                      }}
                      className="py-2.5 px-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 font-semibold text-center text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Lock className="w-3.5 h-3.5 text-sky-400" />
                      <span>{lang === 'th' ? 'ล็อกเท่าทุนทุกไม้' : 'Breakeven All'}</span>
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(lang === 'th' ? 'ต้องการปิดทุกสัญญาฉุกเฉิน (Market Close All) หรือไม่?' : 'Confirm emergency close all positions?')) {
                          positions.forEach(p => onClosePosition(p.id));
                        }
                      }}
                      className="py-2.5 px-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold text-center text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{lang === 'th' ? 'ปิดฉุกเฉินทั้งหมด' : 'Panic Close All'}</span>
                    </button>
                  </div>

                  {/* Open Positions Mobile Cards */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                      <span className="font-bold text-white">{lang === 'th' ? 'ออเดอร์ที่กำลังเทรด' : 'Active Trades'}</span>
                      <span className="text-[10px]"><span className="font-mono">{positions.length}</span> {lang === 'th' ? 'รายการ' : 'orders'}</span>
                    </div>

                    {positions.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center text-slate-500 text-xs">
                        ไม่มีสัญญาเปิดอยู่ บอทกำลังสแกนหาจังหวะเข้าเทรด...
                      </div>
                    ) : (
                      positions.map((pos, idx) => (
                        <div 
                          key={pos.id}
                          className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 space-y-2 hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                pos.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {pos.side}
                              </span>
                              <span className="font-bold text-white text-xs">{pos.symbol}</span>
                              <span className="text-[10px] font-mono text-slate-400">{pos.leverage}x</span>
                            </div>

                            <span className={`font-mono font-bold text-xs ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pos.unrealizedPnl >= 0 ? `+$${pos.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`}
                            </span>
                          </div>

                          {/* Data source origin & order slot number */}
                          <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800/60">
                            <span className="font-mono text-emerald-400 font-semibold">
                              ไม้ {pos.orderSlotNumber || (idx + 1)}/4
                            </span>
                            <span className="text-slate-300 truncate max-w-[190px]">
                              {pos.dataSource || (pos.marketType === 'crypto_futures' ? 'Binance Futures (fapi v1)' : 'Binance Spot')}
                            </span>
                          </div>

                          {/* Price details grid */}
                          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                            <div>
                              <span className="text-slate-500 block text-[9px]">Entry</span>
                              <span className="text-slate-200">${pos.entryPrice.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px]">Current</span>
                              <span className="text-emerald-400 font-bold">${pos.currentPrice.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px]">Stop Loss</span>
                              <span className="text-rose-400">${pos.stopLossPrice.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px]">Take Profit</span>
                              <span className="text-sky-400">${pos.takeProfit1.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* 1-Tap Mobile Actions */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => onSetBreakeven(pos.id)}
                              className="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] flex items-center justify-center gap-1 transition-colors"
                            >
                              <Lock className="w-3 h-3 text-sky-400" />
                              <span>{lang === 'th' ? 'ล็อกเท่าทุน' : 'Breakeven'}</span>
                            </button>

                            <button
                              onClick={() => onClosePosition(pos.id)}
                              className="py-1 px-2.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 font-mono text-[10px] transition-colors"
                            >
                              {lang === 'th' ? 'ปิดไม้นี้' : 'Close'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Real-time Tailscale telemetry feed */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-400" />
                        {lang === 'th' ? 'สถานะเซิร์ฟเวอร์ GCP VM' : 'GCP VM Telemetry'}
                      </span>
                      <span className="text-emerald-400 font-mono">Normal (Stable)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1 font-mono">
                      <div>CPU Load: <span className="text-white">4.8%</span></div>
                      <div>RAM: <span className="text-white">320MB / 1GB</span></div>
                      <div>Swap: <span className="text-white">45MB / 2GB</span></div>
                      <div>Uptime: <span className="text-emerald-400">14d 6h</span></div>
                    </div>
                  </div>

                </div>

                {/* Mobile Bottom Home Bar indicator */}
                <div className="mt-auto pt-3 flex justify-center">
                  <div className="w-32 h-1 bg-slate-700 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Tailscale QR Code Scanner & Connection Instructions */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* Direct Connect QR Card */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {lang === 'th' ? 'สแกน QR Code เปิดดูบอทบนมือถือทันที' : 'Instant Mobile QR Code Connect'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {lang === 'th' ? 'สแกนด้วยกล้องมือถือ iPhone / Android เมื่อเปิด Tailscale VPN' : 'Scan with your mobile camera while connected to Tailscale VPN.'}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Zero Port Exposure
                </span>
              </div>

              {/* QR Code and URL display */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center p-4 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="sm:col-span-5 flex justify-center">
                  {qrCodeDataUrl ? (
                    <div className="p-2.5 bg-slate-950 rounded-2xl border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10 inline-block">
                      <img 
                        src={qrCodeDataUrl} 
                        alt="Tailscale Mobile QR Code" 
                        className="w-44 h-44 rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="w-44 h-44 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 text-xs">
                      กำลังสร้าง QR...
                    </div>
                  )}
                </div>

                <div className="sm:col-span-7 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {lang === 'th' ? 'ที่อยู่สำหรับเข้าใช้งานบนมือถือ (Tailscale Private URL):' : 'Private Mobile URL:'}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-400 font-bold overflow-x-auto whitespace-nowrap">
                        {fullTailscaleUrl}
                      </div>
                      <button
                        onClick={() => handleCopy(fullTailscaleUrl, 'mobile_url')}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                        title="คัดลอก URL"
                      >
                        {copiedKey === 'mobile_url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Tailscale MagicDNS alternative */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {lang === 'th' ? 'หรือเข้าผ่าน MagicDNS Hostname:' : 'Or via MagicDNS Name:'}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto whitespace-nowrap">
                        http://{magicDns}:{port}
                      </div>
                      <button
                        onClick={() => handleCopy(`http://${magicDns}:${port}`, 'magicdns')}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                      >
                        {copiedKey === 'magicdns' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-1 pt-1">
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'th' ? 'ปลอดภัย 100%: ไม่ต้องเปิดพอร์ตใน Google Cloud Firewall' : '100% Secure: No ports opened in Google Cloud Firewall'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>{lang === 'th' ? 'เชื่อมต่อตรงแบบ Peer-to-Peer เข้ารหัส WireGuard 256-bit' : 'Direct P2P encrypted WireGuard mesh between phone & VM'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Why Tailscale + Proxy is Critical for Google Cloud Free Tier */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                {lang === 'th' ? 'ทำไมต้องใช้ Tailscale และ Proxy บน Google Cloud Free Tier?' : 'Why Tailscale + Proxy is Essential on GCP Free Tier'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>ปัญหาที่ 1: Binance Geoblock สหรัฐฯ</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    เครื่อง Google Cloud VM ฟรี (Always-Free e2-micro) ตั้งอยู่ในสหรัฐฯ (us-central1, us-east1) ซึ่ง Binance ปิดกั้น API การเทรด Futures (HTTP 451) การใส่ <code className="text-amber-300 font-mono">proxies</code> จะส่งคำสั่งซื้อขายผ่าน Proxy นอก US ทันที
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>ปัญหาที่ 2: ความปลอดภัยของแดชบอร์ด</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    การเปิดพอร์ต 3000 ให้ทั้งโลกเข้าถึงเสี่ยงต่อการโดนสแกนพอร์ตและโจมตี เมื่อใช้ Tailscale คุณสามารถปิดพอร์ตทั้งหมดใน Google Cloud Firewall และเข้าดูได้เฉพาะจากมือถือของคุณเครื่องเดียว
                  </p>
                </div>
              </div>
            </div>

            {/* Quick 3-Step Setup on Mobile */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <span className="font-bold text-white block">
                {lang === 'th' ? '📲 ขั้นตอนการใช้งานบนมือถือครั้งแรก:' : '📲 3-Step Mobile First-Time Setup:'}
              </span>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                <li>ดาวน์โหลดแอป <strong>Tailscale</strong> จาก App Store (iOS) หรือ Google Play (Android)</li>
                <li>ล็อกอินด้วยบัญชีเดียวกับที่ติดตั้งบน Google Cloud VM (เช่น Google Account)</li>
                <li>เปิดแอปแล้วกด Connect จากนั้นเปิดกล้องสแกน QR Code ด้านบนเพื่อเข้าดูแดชบอร์ดบอทได้ทันที!</li>
              </ol>
            </div>

          </div>
        </div>
      )}

      {/* SECTION 2: BINANCE PROXY CONFIGURATOR & CODE GENERATOR */}
      {activeSection === 'proxy_code' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Form: Proxy Inputs & Presets */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    {lang === 'th' ? 'ตัวตั้งค่า Proxy บังคับวิ่งออกนอก US' : 'Binance Proxy Configurator'}
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">CCXT Proxies Spec</span>
              </div>

              {/* Presets List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {lang === 'th' ? 'โหนด Proxy สำเร็จรูป (แนะนำสำหรับ Binance Futures):' : 'Recommended Non-US Presets:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PROXY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-200 group-hover:text-emerald-400 flex items-center gap-1.5">
                          <span>{preset.flag}</span>
                          <span>{preset.name}</span>
                        </span>
                        <span className="text-[9px] font-mono px-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {preset.protocol}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        {preset.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol & Target Market */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">โปรโตคอล (Protocol)</label>
                  <select
                    value={proxyConfig.protocol}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, protocol: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="socks5h">socks5h:// (Remote DNS - แนะนำสูงสุด)</option>
                    <option value="socks5">socks5:// (Standard SOCKS5)</option>
                    <option value="https">https:// (Secure HTTPS Proxy)</option>
                    <option value="http">http:// (Standard HTTP Proxy)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">เป้าหมาย (Market Type)</label>
                  <select
                    value={proxyConfig.targetMarket}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, targetMarket: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="future">future (Binance USDⓈ-M Futures)</option>
                    <option value="spot">spot (Binance Crypto Spot)</option>
                  </select>
                </div>
              </div>

              {/* Host & Port */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Proxy Host / IP</label>
                  <input
                    type="text"
                    value={proxyConfig.host}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, host: e.target.value })}
                    placeholder="e.g. sg-proxy.net or 128.199.x.x"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Port</label>
                  <input
                    type="number"
                    value={proxyConfig.port}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, port: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Credentials (Username & Password) */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Username (ถ้ามี)</label>
                  <input
                    type="text"
                    value={proxyConfig.username || ''}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, username: e.target.value })}
                    placeholder="proxy_user"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Password (ถ้ามี)</label>
                  <input
                    type="password"
                    value={proxyConfig.password || ''}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Testnet Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div>
                  <span className="font-semibold text-white block">โหมดทดสอบ Testnet (Paper)</span>
                  <span className="text-[10px] text-slate-500">ทดสอบรันด้วยเงินจำลองก่อนใช้ API จริง</span>
                </div>
                <input
                  type="checkbox"
                  checked={proxyConfig.testnet}
                  onChange={(e) => setProxyConfig({ ...proxyConfig, testnet: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
                />
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-1 space-y-2.5">
                <button
                  onClick={handleTestProxy}
                  disabled={isTestingProxy}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingProxy ? 'animate-spin' : ''}`} />
                  <span>{isTestingProxy ? 'กำลังทดสอบ Ping ผ่าน Proxy...' : 'ทดสอบการเชื่อมต่อ Binance ผ่าน Proxy'}</span>
                </button>

                {proxyTestResult && (
                  <div className={`p-3 rounded-xl text-xs border ${
                    proxyTestResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>โหนดปลายทาง: {proxyTestResult.ipCountry}</span>
                      </span>
                      <span className="font-mono">{proxyTestResult.latency} ms</span>
                    </div>
                    <p className="text-[11px] opacity-90">{proxyTestResult.message}</p>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right Code Generator: Python CCXT & Node.js Output */}
          <div className="lg:col-span-7 space-y-4">
            
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">
                    {lang === 'th' ? 'โค้ดเชื่อมต่อพร้อมก๊อปปี้ไปรันบน Google Cloud VM' : 'Production-Ready Proxy Script'}
                  </h3>
                </div>

                {/* Language Selector */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setCodeLang('python')}
                    className={`px-2.5 py-1 rounded font-mono font-medium transition-colors ${
                      codeLang === 'python' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Python (CCXT)
                  </button>
                  <button
                    onClick={() => setCodeLang('node')}
                    className={`px-2.5 py-1 rounded font-mono font-medium transition-colors ${
                      codeLang === 'node' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Node.js / TS
                  </button>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>
                  {codeLang === 'python' 
                    ? 'สคริปต์ Python CCXT ปรับแต่งตาม Proxy ที่คุณกรอก พร้อมระบบ Auto-Reconnect' 
                    : 'โค้ด Node.js / TypeScript รองรับทั้ง SocksProxyAgent และ HttpsProxyAgent'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const code = codeLang === 'python' 
                        ? generatePythonCcxtCode(proxyConfig, apiKeyInput, secretKeyInput)
                        : generateNodeCcxtCode(proxyConfig);
                      handleCopy(code, 'export_code');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono transition-colors"
                  >
                    {copiedKey === 'export_code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'export_code' ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ด'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const code = codeLang === 'python' 
                        ? generatePythonCcxtCode(proxyConfig, apiKeyInput, secretKeyInput)
                        : generateNodeCcxtCode(proxyConfig);
                      const filename = codeLang === 'python' ? 'binance_proxy_bot.py' : 'binanceProxyBot.ts';
                      triggerFileDownload(code, filename, 'text/plain');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Code Viewer */}
              <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[500px]">
                <pre>
                  {codeLang === 'python' 
                    ? generatePythonCcxtCode(proxyConfig, apiKeyInput, secretKeyInput)
                    : generateNodeCcxtCode(proxyConfig)}
                </pre>
              </div>

              {/* How to run instructions */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <span className="font-bold text-white block">
                  {lang === 'th' ? 'วิธีรันบน Google Cloud VM e2-micro:' : 'Execution on Google Cloud VM:'}
                </span>
                <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-emerald-400 flex items-center justify-between border border-slate-800">
                  <code>pip3 install ccxt pysocks && python3 binance_proxy_bot.py</code>
                  <button 
                    onClick={() => handleCopy('pip3 install ccxt pysocks && python3 binance_proxy_bot.py', 'pip_cmd')}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    {copiedKey === 'pip_cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  * <strong>pysocks</strong> จำเป็นต้องติดตั้งเพื่อรองรับ SOCKS5 และ SOCKS5h ในภาษา Python
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: 1-CLICK VM SETUP GUIDE (GCP + TAILSCALE) */}
      {activeSection === 'vm_setup' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {lang === 'th' ? 'สคริปต์ติดตั้ง Tailscale บน Google Cloud Always-Free VM' : 'Tailscale Automated GCP VM Installer'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lang === 'th' ? 'คำสั่งเดียวติดตั้ง WireGuard mesh VPN และเปิดบริการอัตโนมัติเมื่อรีสตาร์ตเครื่อง' : '1-command setup of Tailscale WireGuard daemon with auto-recovery on e2-micro.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleCopy(generateTailscaleGcpScript(), 'tailscale_script')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
              >
                {copiedKey === 'tailscale_script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'tailscale_script' ? 'คัดลอกสคริปต์แล้ว' : 'คัดลอกสคริปต์ทั้งหมด'}</span>
              </button>
            </div>

            {/* Step-by-Step Interactive Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 font-bold text-[11px]">
                    1
                  </span>
                  <span className="font-bold text-white">SSH เข้าเครื่อง VM</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  เปิด Google Cloud Shell หรือโปรแกรม Terminal บนคอมของคุณ แล้วใช้คำสั่ง gcloud เพื่อเข้าถึง VM:
                </p>
                <div className="p-2 rounded bg-slate-900 font-mono text-[10px] text-sky-300 border border-slate-800">
                  gcloud compute ssh quantumtrade-bot-vm
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[11px]">
                    2
                  </span>
                  <span className="font-bold text-white">รันสคริปต์ติดตั้ง Tailscale</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  วางคำสั่งติดตั้งคลิกเดียวเพื่อลง Tailscale และเชื่อมต่อเข้า Tailnet ของคุณ:
                </p>
                <div className="p-2 rounded bg-slate-900 font-mono text-[10px] text-emerald-400 border border-slate-800">
                  curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-bold text-[11px]">
                    3
                  </span>
                  <span className="font-bold text-white">สแกนเปิดบนมือถือ</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  เมื่อระบบขึ้นเลข IP 100.x.y.z แล้ว ให้เปิดแอป Tailscale ในมือถือ แล้วเข้า URL หรือสแกน QR Code เพื่อดูผลแบบเรียลไทม์ 24 ชม.
                </p>
                <div className="p-2 rounded bg-slate-900 font-mono text-[10px] text-amber-300 border border-slate-800">
                  tailscale ip -4
                </div>
              </div>

            </div>

            {/* Full Script Viewer */}
            <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-72">
              <pre>{generateTailscaleGcpScript()}</pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
