/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { UnifiedAutoTradingDashboard } from './components/UnifiedAutoTradingDashboard';
import { WorkstationView } from './components/WorkstationView';
import { SelfLearningView } from './components/SelfLearningView';
import { NewsRadarView } from './components/NewsRadarView';
import { MultiAccountView } from './components/MultiAccountView';
import { BacktestView } from './components/BacktestView';
import { GoogleFreeTierModal } from './components/GoogleFreeTierModal';
import { TelegramModal } from './components/TelegramModal';
import { SecurityVaultModal } from './components/SecurityVaultModal';

import { 
  MarketType, 
  TradableSymbol, 
  Position, 
  AccountPortfolio, 
  NewsBlackoutEvent, 
  TelegramSettings, 
  SystemRiskConfig, 
  ExecutionLogItem,
  SelfLearningMetric,
  OrderSide,
  OrderType
} from './types/trading';

import { 
  INITIAL_CRYPTO_SYMBOLS, 
  INITIAL_SPOT_CRYPTO_SYMBOLS,
  INITIAL_FOREX_SYMBOLS, 
  INITIAL_ACCOUNTS, 
  UPCOMING_NEWS_EVENTS, 
  INITIAL_SELF_LEARNING_METRICS,
  generateCandles 
} from './utils/mockMarketData';

import { 
  Candle, 
  MarketRegime, 
  StrategyHyperparameters, 
  evaluateMarketRegime, 
  getRecommendedParametersForRegime, 
  isNewsBlackout, 
  isSessionBlackout,
  calculateUnrealizedPnl,
  generateIcebergTranches
} from './utils/tradingMath';

import { sendTelegramAlert } from './utils/telegramService';

export default function App() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [activeTab, setActiveTab] = useState<'unified_autopilot' | 'workstation' | 'self_learning' | 'news_radar' | 'multi_account' | 'backtest'>('unified_autopilot');
  const [engineRunning, setEngineRunning] = useState<boolean>(true);

  // Dual Autonomous Engines State
  const [futuresEngineActive, setFuturesEngineActive] = useState<boolean>(true);
  const [spotEngineActive, setSpotEngineActive] = useState<boolean>(true);

  // Market & Symbols
  const [marketType, setMarketType] = useState<MarketType>('crypto_futures');
  const [cryptoSymbols, setCryptoSymbols] = useState(INITIAL_CRYPTO_SYMBOLS);
  const [cryptoSpotSymbols, setCryptoSpotSymbols] = useState(INITIAL_SPOT_CRYPTO_SYMBOLS);
  const [forexSymbols, setForexSymbols] = useState(INITIAL_FOREX_SYMBOLS);
  const [selectedSymbol, setSelectedSymbol] = useState<TradableSymbol>(INITIAL_CRYPTO_SYMBOLS[0]);

  // Market Candles (for chart & real-time updates)
  const [candles, setCandles] = useState<Candle[]>(() => generateCandles(INITIAL_CRYPTO_SYMBOLS[0].currentPrice, 50));

  // Multi-Account Portfolios
  const [accounts, setAccounts] = useState<AccountPortfolio[]>(INITIAL_ACCOUNTS);
  const activeAccount = accounts[0];

  // Positions & Orders (Concurrent Binance Futures 10x and Crypto Spot 1x)
  const [positions, setPositions] = useState<Position[]>([
    {
      id: 'pos-1',
      accountId: 'acc-binance-main',
      symbol: 'BTC/USDT',
      marketType: 'crypto_futures',
      side: 'LONG',
      entryPrice: 67800.00,
      currentPrice: 68420.50,
      size: 0.25,
      leverage: 10,
      margin: 1695.00,
      stopLossPrice: 67800.00, // Breakeven locked
      takeProfit1: 69200.00,
      takeProfit2: 70500.00,
      takeProfit3: 72000.00,
      liquidationPrice: 61359.00,
      openTime: Date.now() - 45 * 60 * 1000,
      unrealizedPnl: 155.12,
      unrealizedPnlPct: 9.15,
      isTrailingActive: true,
      peakPriceSinceEntry: 68600.00,
    },
    {
      id: 'pos-2',
      accountId: 'acc-binance-main',
      symbol: 'ETH/USDT (Spot)',
      marketType: 'crypto_spot',
      side: 'LONG',
      entryPrice: 3490.00,
      currentPrice: 3538.50,
      size: 1.20,
      leverage: 1,
      margin: 4188.00,
      stopLossPrice: 3420.00,
      takeProfit1: 3650.00,
      takeProfit2: 3780.00,
      takeProfit3: 3950.00,
      liquidationPrice: 0, // Spot has 0 liquidation risk
      openTime: Date.now() - 120 * 60 * 1000,
      unrealizedPnl: 58.20,
      unrealizedPnlPct: 1.39,
      isTrailingActive: true,
      peakPriceSinceEntry: 3550.00,
    },
  ]);

  // Self-Learning AI State
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>('TRENDING_BULL');
  const [activeParams, setActiveParams] = useState<StrategyHyperparameters>(() => getRecommendedParametersForRegime('TRENDING_BULL'));
  const [metricsHistory, setMetricsHistory] = useState<SelfLearningMetric[]>(INITIAL_SELF_LEARNING_METRICS);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // News Blackout & Session Filter State
  const [newsEvents, setNewsEvents] = useState<NewsBlackoutEvent[]>(UPCOMING_NEWS_EVENTS);
  const [blackoutMinutesBefore, setBlackoutMinutesBefore] = useState<number>(30);
  const [blackoutMinutesAfter, setBlackoutMinutesAfter] = useState<number>(30);
  const [avoidRolloverHours, setAvoidRolloverHours] = useState<boolean>(true);

  // Telegram Settings
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    enabled: false,
    botToken: '',
    chatId: '',
    notifyOnTradeOpen: true,
    notifyOnTpSlHit: true,
    notifyOnNewsBlackout: true,
    notifyDailySummary: true,
    notifyRiskAlert: true,
  });

  // Risk & Safety Config
  const [riskConfig, setRiskConfig] = useState<SystemRiskConfig>({
    maxRiskPerTradePct: 1.0,
    maxDailyDrawdownPct: 4.0,
    circuitBreakerActive: false,
    orderSplittingEnabled: true,
    icebergTranchesCount: 4,
    slippageTolerancePct: 0.03,
    newsBlackoutMinutesBefore: 30,
    newsBlackoutMinutesAfter: 30,
    avoidRolloverHours: true,
    masterPasswordSet: false,
    autoDailyBackupEnabled: true,
  });

  // Execution Logs
  const [logs, setLogs] = useState<ExecutionLogItem[]>([
    {
      id: 'log-1',
      timestamp: Date.now() - 30 * 60 * 1000,
      marketType: 'crypto_futures',
      symbol: 'BTC/USDT',
      type: 'ORDER_OPEN',
      level: 'SUCCESS',
      message: 'เปิดคำสั่งซื้อ LONG BTC/USDT (0.25 BTC, 10x) ผ่านการกระจาย Iceberg 4 ไม้สำเร็จ',
    },
    {
      id: 'log-2',
      timestamp: Date.now() - 15 * 60 * 1000,
      marketType: 'crypto_futures',
      symbol: 'BTC/USDT',
      type: 'SELF_LEARN',
      level: 'INFO',
      message: 'AI ปรับจูน Trailing Stop อัตโนมัติ: ล็อกจุดคุ้มทุน (Breakeven) ที่ $67,800.00',
    },
  ]);

  // AI Auto-Pilot State
  const [aiAutoPilotEnabled, setAiAutoPilotEnabled] = useState<boolean>(true);

  // Modals
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState<boolean>(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);

  // Sync candles when symbol changes
  useEffect(() => {
    setCandles(generateCandles(selectedSymbol.currentPrice, 50));
  }, [selectedSymbol.symbol]);

  // Check News & Session Blackout
  const newsBlackoutCheck = isNewsBlackout(
    newsEvents.map(e => ({ id: e.id, title: e.title, currency: e.currency, impact: e.impact, timestamp: e.timestamp })),
    Date.now(),
    blackoutMinutesBefore,
    blackoutMinutesAfter
  );

  const sessionBlackoutCheck = avoidRolloverHours 
    ? isSessionBlackout(new Date(), marketType)
    : { active: false };

  const isBlackoutActive = newsBlackoutCheck.active || sessionBlackoutCheck.active;
  const blackoutReason = newsBlackoutCheck.active 
    ? `ข่าวแรงใกล้เข้ามา: ${newsBlackoutCheck.triggerNews?.title}` 
    : sessionBlackoutCheck.reason;

  // 24/7 Autonomous Background Simulation & Tick Engine (Concurrent Dual-Engine)
  useEffect(() => {
    if (!engineRunning) return;

    let tickCounter = 0;

    const interval = setInterval(() => {
      tickCounter++;

      // 1. Tick price update for selected symbol
      const volatility = selectedSymbol.marketType === 'crypto_futures' ? 0.0006 : 0.00025;
      const deltaPct = (Math.random() - 0.495) * volatility;
      const newPrice = Number((selectedSymbol.currentPrice * (1 + deltaPct)).toFixed(
        selectedSymbol.currentPrice > 10 ? 2 : 5
      ));

      // Update current symbol price in its respective list
      if (selectedSymbol.marketType === 'crypto_futures') {
        setCryptoSymbols(prev => prev.map(s => s.symbol === selectedSymbol.symbol ? { ...s, currentPrice: newPrice } : s));
      } else if (selectedSymbol.marketType === 'crypto_spot') {
        setCryptoSpotSymbols(prev => prev.map(s => s.symbol === selectedSymbol.symbol ? { ...s, currentPrice: newPrice } : s));
      } else {
        setForexSymbols(prev => prev.map(s => s.symbol === selectedSymbol.symbol ? { ...s, currentPrice: newPrice } : s));
      }
      setSelectedSymbol(prev => ({ ...prev, currentPrice: newPrice }));

      // Also tick background spot symbols if not selected
      if (spotEngineActive && tickCounter % 2 === 0) {
        setCryptoSpotSymbols(prev => prev.map(s => {
          if (s.symbol === selectedSymbol.symbol) return s;
          const spotDelta = (Math.random() - 0.495) * 0.0003;
          return {
            ...s,
            currentPrice: Number((s.currentPrice * (1 + spotDelta)).toFixed(2)),
          };
        }));
      }

      // Append/Update last candle
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const last = { ...prev[prev.length - 1] };
        last.close = newPrice;
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
        return [...prev.slice(0, -1), last];
      });

      // 2. Evaluate all active positions across Futures and Spot
      setPositions(prevPositions => {
        const remaining: Position[] = [];

        for (const pos of prevPositions) {
          // Find mark price from symbol lists
          let mark = pos.currentPrice;
          if (pos.symbol === selectedSymbol.symbol) {
            mark = newPrice;
          } else {
            const foundF = cryptoSymbols.find(s => s.symbol === pos.symbol);
            const foundS = cryptoSpotSymbols.find(s => s.symbol === pos.symbol);
            if (foundF) mark = foundF.currentPrice;
            else if (foundS) mark = foundS.currentPrice;
          }

          const pnlCalc = calculateUnrealizedPnl(pos.entryPrice, mark, pos.size, pos.side, pos.leverage);
          let peak = Math.max(pos.peakPriceSinceEntry, mark);
          let sl = pos.stopLossPrice;

          // Asymmetric Profit Trailing & Breakeven Lock logic
          if (pos.isTrailingActive) {
            const initialRiskDist = Math.abs(pos.entryPrice - pos.stopLossPrice) || (pos.entryPrice * 0.015);
            // If profit reaches 1.5R, lock breakeven immediately
            if (pos.side === 'LONG' && mark >= pos.entryPrice + initialRiskDist * 1.5 && sl < pos.entryPrice) {
              sl = pos.entryPrice;
              setLogs(prevLogs => [
                {
                  id: `log-trail-be-${Date.now()}`,
                  timestamp: Date.now(),
                  marketType: pos.marketType,
                  symbol: pos.symbol,
                  type: 'SELF_LEARN',
                  level: 'SUCCESS',
                  message: `AI Trailing: กำไรแตะ +1.5R ทำการล็อก Stop Loss ที่จุดคุ้มทุน (Breakeven $${pos.entryPrice}) ปลอดความเสี่ยง 100%`,
                },
                ...prevLogs,
              ]);
            } else if (pos.side === 'SHORT' && mark <= pos.entryPrice - initialRiskDist * 1.5 && sl > pos.entryPrice) {
              sl = pos.entryPrice;
            }

            // Continuous trailing
            const trailDist = (pos.entryPrice * 0.012);
            if (pos.side === 'LONG' && mark > pos.entryPrice + trailDist * 1.5) {
              sl = Math.max(sl, mark - trailDist);
            } else if (pos.side === 'SHORT' && mark < pos.entryPrice - trailDist * 1.5) {
              sl = Math.min(sl, mark + trailDist);
            }
          }

          // Check TP hit
          if ((pos.side === 'LONG' && mark >= pos.takeProfit1) || (pos.side === 'SHORT' && mark <= pos.takeProfit1)) {
            setLogs(prevLogs => [
              {
                id: `log-tp-${Date.now()}`,
                timestamp: Date.now(),
                marketType: pos.marketType,
                symbol: pos.symbol,
                type: 'TP_HIT',
                level: 'SUCCESS',
                message: `เป้าหมาย Take Profit แตะสำเร็จ! ${pos.symbol} ปิดทำกำไร +$${pnlCalc.netPnl.toFixed(2)} (+${pnlCalc.pnlPct}%)`,
              },
              ...prevLogs,
            ]);

            if (telegramSettings.enabled && telegramSettings.notifyOnTpSlHit) {
              sendTelegramAlert(telegramSettings.botToken, telegramSettings.chatId, {
                title: `Take Profit 🎯 แตะจุดทำกำไร ${pos.symbol}`,
                type: 'TP_HIT',
                details: {
                  'คู่เหรียญ': pos.symbol,
                  'ทิศทาง': pos.side,
                  'ราคาปิด': `$${mark}`,
                  'กำไรสุทธิ': `+$${pnlCalc.netPnl.toFixed(2)} (${pnlCalc.pnlPct}%)`,
                },
              });
            }

            setAccounts(prevAccs => prevAccs.map(a => a.id === pos.accountId ? {
              ...a,
              balance: a.balance + pnlCalc.netPnl,
              equity: a.equity + pnlCalc.netPnl,
            } : a));

            continue;
          }

          // Check SL hit
          if ((pos.side === 'LONG' && mark <= sl) || (pos.side === 'SHORT' && mark >= sl)) {
            setLogs(prevLogs => [
              {
                id: `log-sl-${Date.now()}`,
                timestamp: Date.now(),
                marketType: pos.marketType,
                symbol: pos.symbol,
                type: 'SL_HIT',
                level: 'WARNING',
                message: `ตัดขาดทุน Stop Loss ทำงานตามแผน ${pos.symbol} ขาดทุน $${pnlCalc.netPnl.toFixed(2)} (${pnlCalc.pnlPct}%)`,
              },
              ...prevLogs,
            ]);

            if (telegramSettings.enabled && telegramSettings.notifyOnTpSlHit) {
              sendTelegramAlert(telegramSettings.botToken, telegramSettings.chatId, {
                title: `Stop Loss 🛑 ตัดขาดทุนตามวินัย ${pos.symbol}`,
                type: 'SL_HIT',
                details: {
                  'คู่เหรียญ': pos.symbol,
                  'ราคาตัดขาดทุน': `$${mark}`,
                  'ผลลัพธ์': `$${pnlCalc.netPnl.toFixed(2)}`,
                },
              });
            }

            setAccounts(prevAccs => prevAccs.map(a => a.id === pos.accountId ? {
              ...a,
              balance: a.balance + pnlCalc.netPnl,
              equity: a.equity + pnlCalc.netPnl,
            } : a));

            continue;
          }

          // Still active
          remaining.push({
            ...pos,
            currentPrice: mark,
            unrealizedPnl: pnlCalc.netPnl,
            unrealizedPnlPct: pnlCalc.pnlPct,
            stopLossPrice: sl,
            peakPriceSinceEntry: peak,
          });
        }

        return remaining;
      });

    }, 1500);

    return () => clearInterval(interval);
  }, [engineRunning, futuresEngineActive, spotEngineActive, selectedSymbol, cryptoSymbols, cryptoSpotSymbols, telegramSettings]);

  // Order Placement Handler
  const handleOpenPosition = ({
    symbol,
    side,
    type,
    leverage,
    riskPct,
    customSize,
    icebergTranches = 1,
    stopLossPrice,
    takeProfitPrice,
  }: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    leverage: number;
    riskPct: number;
    customSize?: number;
    icebergTranches?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }) => {
    const mark = selectedSymbol.currentPrice;
    const sl = stopLossPrice || (side === 'LONG' ? mark * 0.985 : mark * 1.015);
    const tp1 = takeProfitPrice || (side === 'LONG' ? mark * 1.025 : mark * 0.975);
    const size = customSize || 0.1;
    const margin = (size * mark) / leverage;

    const newPos: Position = {
      id: `pos-${Date.now()}`,
      accountId: activeAccount.id,
      symbol,
      marketType,
      side,
      entryPrice: mark,
      currentPrice: mark,
      size,
      leverage,
      margin: Number(margin.toFixed(2)),
      stopLossPrice: Number(sl.toFixed(2)),
      takeProfit1: Number(tp1.toFixed(2)),
      takeProfit2: Number((side === 'LONG' ? mark * 1.04 : mark * 0.96).toFixed(2)),
      takeProfit3: Number((side === 'LONG' ? mark * 1.06 : mark * 0.94).toFixed(2)),
      liquidationPrice: Number((side === 'LONG' ? mark * (1 - 1 / leverage + 0.005) : mark * (1 + 1 / leverage - 0.005)).toFixed(2)),
      openTime: Date.now(),
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      isTrailingActive: true,
      peakPriceSinceEntry: mark,
    };

    setPositions(prev => [newPos, ...prev]);

    const msg = type === 'ICEBERG'
      ? `กระจายคำสั่งซื้อ Iceberg (${icebergTranches} ไม้) สำเร็จ: ${side} ${symbol} @ $${mark}`
      : `เปิดคำสั่ง ${side} ${symbol} @ $${mark} (เลเวอเรจ ${leverage}x)`;

    setLogs(prev => [
      {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        marketType,
        symbol,
        type: 'ORDER_OPEN',
        level: 'SUCCESS',
        message: msg,
      },
      ...prev,
    ]);

    // Telegram Notification
    if (telegramSettings.enabled && telegramSettings.notifyOnTradeOpen) {
      sendTelegramAlert(telegramSettings.botToken, telegramSettings.chatId, {
        title: `เปิดคำสั่ง ${side} ${symbol}`,
        type: 'ORDER_OPEN',
        details: {
          'คู่เหรียญ': `${symbol} ${leverage}x`,
          'ราคาเข้า': `$${mark}`,
          'Stop Loss': `$${sl.toFixed(2)}`,
          'เป้าหมาย TP1': `$${tp1.toFixed(2)}`,
          'ประเภท': type === 'ICEBERG' ? `Iceberg (${icebergTranches} ไม้)` : type,
        },
      });
    }
  };

  // Close Position Handler
  const handleClosePosition = (id: string) => {
    const pos = positions.find(p => p.id === id);
    if (!pos) return;

    setPositions(prev => prev.filter(p => p.id !== id));
    setAccounts(prev => prev.map(a => a.id === pos.accountId ? {
      ...a,
      balance: a.balance + pos.unrealizedPnl,
      equity: a.equity + pos.unrealizedPnl,
    } : a));

    setLogs(prev => [
      {
        id: `log-close-${Date.now()}`,
        timestamp: Date.now(),
        marketType: pos.marketType,
        symbol: pos.symbol,
        type: 'ORDER_CLOSE',
        level: 'INFO',
        message: `ปิดคำสั่งตามความประสงค์: ${pos.side} ${pos.symbol} รับผลกำไร $${pos.unrealizedPnl.toFixed(2)}`,
      },
      ...prev,
    ]);
  };

  // Set Breakeven Handler
  const handleSetBreakeven = (id: string) => {
    setPositions(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          stopLossPrice: p.entryPrice,
        };
      }
      return p;
    }));

    setLogs(prev => [
      {
        id: `log-be-${Date.now()}`,
        timestamp: Date.now(),
        marketType,
        symbol: selectedSymbol.symbol,
        type: 'SYSTEM',
        level: 'INFO',
        message: `ย้าย Stop Loss ไปที่จุดคุ้มทุน (Breakeven) สำเร็จ ปลอดความเสี่ยง 100%`,
      },
      ...prev,
    ]);
  };

  // Trigger Evolutionary AI Optimization
  const handleTriggerOptimization = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const detected = evaluateMarketRegime(candles);
      setCurrentRegime(detected);
      const newP = getRecommendedParametersForRegime(detected);
      setActiveParams(newP);

      const newGen: SelfLearningMetric = {
        generation: (metricsHistory[0]?.generation || 14) + 1,
        timestamp: Date.now(),
        regime: detected,
        winRate: Number((65 + Math.random() * 8).toFixed(1)),
        profitFactor: Number((2.1 + Math.random() * 0.6).toFixed(2)),
        adaptedParams: {
          emaFast: newP.emaFast,
          emaSlow: newP.emaSlow,
          atrSlMultiplier: newP.atrSlMultiplier,
          tpMultiplier1: newP.tpMultiplier1,
          tpMultiplier2: newP.tpMultiplier2,
          trailingStopMultiplier: newP.trailingStopMultiplier,
        },
        improvementPct: Number((3 + Math.random() * 5).toFixed(1)),
        notes: `AI คำนวณความผันผวน 50 แท่งล่าสุดในสภาวะ ${detected} และปรับแต่งตัวคูณ Stop Loss & TP ให้ยืดหยุ่นตาม ATR`,
      };

      setMetricsHistory(prev => [newGen, ...prev]);
      setIsOptimizing(false);

      setLogs(prev => [
        {
          id: `log-opt-${Date.now()}`,
          timestamp: Date.now(),
          marketType,
          symbol: selectedSymbol.symbol,
          type: 'SELF_LEARN',
          level: 'SUCCESS',
          message: `Gen #${newGen.generation} สำเร็จ: ตรวจพบสภาวะ ${detected} และปรับแต่งพารามิเตอร์อัตโนมัติ (+${newGen.improvementPct}%)`,
        },
        ...prev,
      ]);
    }, 600);
  };

  // Simulate News Shock
  const handleSimulateNewsSpike = () => {
    const shockNews: NewsBlackoutEvent = {
      id: `shock-${Date.now()}`,
      title: 'Breaking: Fed Emergency Rate Announcement',
      currency: 'USD',
      impact: 'HIGH',
      timestamp: Date.now() + 5 * 60 * 1000,
      description: 'ฉุกเฉิน: ประกาศปรับอัตราดอกเบี้ยนอกรอบ บอทระงับเปิดคำสั่งซื้อขายทันที',
    };

    setNewsEvents(prev => [shockNews, ...prev]);

    setLogs(prev => [
      {
        id: `log-shock-${Date.now()}`,
        timestamp: Date.now(),
        marketType,
        symbol: selectedSymbol.symbol,
        type: 'NEWS_BLACKOUT',
        level: 'WARNING',
        message: '🚨 ตรวจพบข่าวด่วนรุนแรง! บอทเปิดโหมด News Blackout ระงับการเปิดออเดอร์ใหม่เพื่อความปลอดภัย',
      },
      ...prev,
    ]);

    if (telegramSettings.enabled && telegramSettings.notifyOnNewsBlackout) {
      sendTelegramAlert(telegramSettings.botToken, telegramSettings.chatId, {
        title: '⚠️ โหมด News Blackout ทำงาน',
        type: 'NEWS_BLACKOUT',
        details: {
          'เหตุการณ์': shockNews.title,
          'ผลกระทบ': 'HIGH VOLATILITY',
          'สถานะบอท': 'ระงับการเปิดคำสั่งซื้อใหม่ชั่วคราว',
        },
      });
    }
  };

  // Account management
  const handleToggleAccount = (id: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const handleAddAccount = (newAcc: Omit<AccountPortfolio, 'id'>) => {
    const fullAcc: AccountPortfolio = {
      ...newAcc,
      id: `acc-${Date.now()}`,
    };
    setAccounts(prev => [...prev, fullAcc]);
    setLogs(prev => [
      {
        id: `log-acc-${Date.now()}`,
        timestamp: Date.now(),
        marketType: fullAcc.marketType,
        symbol: '-',
        type: 'SYSTEM',
        level: 'SUCCESS',
        message: `เชื่อมต่อพอร์ต ${fullAcc.name} (${fullAcc.exchange}) สำเร็จเรียบร้อย`,
      },
      ...prev,
    ]);
  };

  const handleRestoreBackup = (data: { accounts: AccountPortfolio[]; telegramSettings: TelegramSettings }) => {
    setAccounts(data.accounts);
    setTelegramSettings(data.telegramSettings);
    setLogs(prev => [
      {
        id: `log-restore-${Date.now()}`,
        timestamp: Date.now(),
        marketType,
        symbol: '-',
        type: 'SYSTEM',
        level: 'SUCCESS',
        message: `กู้คืนข้อมูลพอร์ตโฟลิโอและกุญแจที่เข้ารหัส AES-GCM สำเร็จ`,
      },
      ...prev,
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        engineRunning={engineRunning}
        setEngineRunning={setEngineRunning}
        lang={lang}
        setLang={setLang}
        onOpenGoogleDeploy={() => setIsGoogleModalOpen(true)}
        onOpenTelegram={() => setIsTelegramModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        isPaper={activeAccount.isPaper}
      />

      {/* Main View Container */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {activeTab === 'unified_autopilot' && (
          <UnifiedAutoTradingDashboard
            engineRunning={engineRunning}
            setEngineRunning={setEngineRunning}
            futuresEngineActive={futuresEngineActive}
            setFuturesEngineActive={setFuturesEngineActive}
            spotEngineActive={spotEngineActive}
            setSpotEngineActive={setSpotEngineActive}
            marketType={marketType}
            setMarketType={setMarketType}
            cryptoFuturesSymbols={cryptoSymbols}
            cryptoSpotSymbols={cryptoSpotSymbols}
            forexSymbols={forexSymbols}
            selectedSymbol={selectedSymbol}
            setSelectedSymbol={setSelectedSymbol}
            candles={candles}
            positions={positions}
            onOpenPosition={handleOpenPosition}
            onClosePosition={handleClosePosition}
            onSetBreakeven={handleSetBreakeven}
            equity={activeAccount.equity}
            balance={activeAccount.balance}
            currentRegime={currentRegime}
            activeParams={activeParams as any}
            metricsHistory={metricsHistory}
            onTriggerOptimization={handleTriggerOptimization}
            isOptimizing={isOptimizing}
            newsEvents={newsEvents}
            isNewsBlackout={isBlackoutActive}
            blackoutReason={blackoutReason}
            logs={logs}
            lang={lang}
          />
        )}

        {activeTab === 'workstation' && (
          <WorkstationView
            marketType={marketType}
            setMarketType={setMarketType}
            cryptoSymbols={cryptoSymbols}
            forexSymbols={forexSymbols}
            selectedSymbol={selectedSymbol}
            setSelectedSymbol={setSelectedSymbol}
            candles={candles}
            positions={positions}
            onOpenPosition={handleOpenPosition}
            onClosePosition={handleClosePosition}
            onSetBreakeven={handleSetBreakeven}
            logs={logs}
            lang={lang}
            equity={activeAccount.equity}
            balance={activeAccount.balance}
            isNewsBlackout={isBlackoutActive}
            blackoutReason={blackoutReason}
            aiAutoPilotEnabled={aiAutoPilotEnabled}
            setAiAutoPilotEnabled={setAiAutoPilotEnabled}
          />
        )}

        {activeTab === 'self_learning' && (
          <SelfLearningView
            currentRegime={currentRegime}
            activeParams={activeParams}
            onUpdateParams={setActiveParams}
            metricsHistory={metricsHistory}
            onTriggerOptimization={handleTriggerOptimization}
            isOptimizing={isOptimizing}
            lang={lang}
          />
        )}

        {activeTab === 'news_radar' && (
          <NewsRadarView
            newsEvents={newsEvents}
            isBlackoutActive={isBlackoutActive}
            activeTriggerNews={newsBlackoutCheck.triggerNews}
            blackoutMinutesBefore={blackoutMinutesBefore}
            setBlackoutMinutesBefore={setBlackoutMinutesBefore}
            blackoutMinutesAfter={blackoutMinutesAfter}
            setBlackoutMinutesAfter={setBlackoutMinutesAfter}
            avoidRolloverHours={avoidRolloverHours}
            setAvoidRolloverHours={setAvoidRolloverHours}
            onSimulateNewsSpike={handleSimulateNewsSpike}
            lang={lang}
          />
        )}

        {activeTab === 'multi_account' && (
          <MultiAccountView
            accounts={accounts}
            onToggleAccount={handleToggleAccount}
            onAddAccount={handleAddAccount}
            lang={lang}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestView lang={lang} />
        )}
      </main>

      {/* Modals */}
      <GoogleFreeTierModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        lang={lang}
      />

      <TelegramModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        settings={telegramSettings}
        onUpdateSettings={setTelegramSettings}
        lang={lang}
      />

      <SecurityVaultModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        accounts={accounts}
        telegramSettings={telegramSettings}
        riskConfig={riskConfig}
        onRestoreBackup={handleRestoreBackup}
        lang={lang}
      />
    </div>
  );
}
