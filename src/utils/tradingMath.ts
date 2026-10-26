/**
 * Pure mathematical, financial, and algorithmic calculations for
 * Crypto Futures & Forex trading, risk management, order distribution,
 * performance metrics, and adaptive strategy tuning.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeResult {
  pnl: number;
  pnlPct: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  side: 'LONG' | 'SHORT';
  fee: number;
  holdingTimeBars: number;
}

export type MarketRegime = 
  | 'TRENDING_BULL'
  | 'TRENDING_BEAR'
  | 'RANGING_LOW_VOL'
  | 'RANGING_HIGH_VOL'
  | 'NEWS_VOLATILITY';

/**
 * Calculates position size based on equity, risk percentage, entry price, and stop loss.
 * Fixed Fractional Position Sizing model.
 */
export function calculatePositionSize(
  equity: number,
  riskPct: number,
  entryPrice: number,
  stopLossPrice: number,
  leverage: number = 1
): { size: number; notional: number; marginRequired: number; riskAmount: number } {
  if (equity <= 0 || riskPct <= 0 || entryPrice <= 0 || stopLossPrice <= 0) {
    return { size: 0, notional: 0, marginRequired: 0, riskAmount: 0 };
  }

  const riskAmount = equity * (riskPct / 100);
  const priceDistance = Math.abs(entryPrice - stopLossPrice);
  
  if (priceDistance <= 0) {
    return { size: 0, notional: 0, marginRequired: 0, riskAmount: 0 };
  }

  // Position size in base currency
  let size = riskAmount / priceDistance;
  let notional = size * entryPrice;

  // Enforce leverage cap
  const maxNotional = equity * leverage;
  if (notional > maxNotional) {
    notional = maxNotional;
    size = notional / entryPrice;
  }

  const marginRequired = notional / leverage;

  return {
    size: Number(size.toFixed(4)),
    notional: Number(notional.toFixed(2)),
    marginRequired: Number(marginRequired.toFixed(2)),
    riskAmount: Number(riskAmount.toFixed(2)),
  };
}

/**
 * Calculates estimated liquidation price for isolated futures margin.
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  side: 'LONG' | 'SHORT',
  leverage: number,
  maintenanceMarginRate: number = 0.005 // 0.5% standard for major crypto pairs
): number {
  if (entryPrice <= 0 || leverage <= 0) return 0;

  if (side === 'LONG') {
    // Liq = Entry * (1 - (1 / Leverage) + MaintenanceMarginRate)
    const liq = entryPrice * (1 - (1 / leverage) + maintenanceMarginRate);
    return Math.max(0, Number(liq.toFixed(4)));
  } else {
    // Liq = Entry * (1 + (1 / Leverage) - MaintenanceMarginRate)
    const liq = entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);
    return Number(liq.toFixed(4));
  }
}

/**
 * Calculates unrealized PnL and return percentage taking leverage and taker/maker fee into account.
 */
export function calculateUnrealizedPnl(
  entryPrice: number,
  currentPrice: number,
  size: number,
  side: 'LONG' | 'SHORT',
  leverage: number = 1,
  feeRate: number = 0.0004 // 0.04% taker fee
): { pnl: number; pnlPct: number; netPnl: number; fee: number } {
  if (entryPrice <= 0 || currentPrice <= 0 || size <= 0) {
    return { pnl: 0, pnlPct: 0, netPnl: 0, fee: 0 };
  }

  const priceDiff = side === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const grossPnl = priceDiff * size;
  const initialMargin = (entryPrice * size) / leverage;
  
  // Total round-trip fee estimate
  const entryFee = entryPrice * size * feeRate;
  const exitFee = currentPrice * size * feeRate;
  const totalFee = entryFee + exitFee;
  const netPnl = grossPnl - totalFee;

  const pnlPct = initialMargin > 0 ? (netPnl / initialMargin) * 100 : 0;

  return {
    pnl: Number(grossPnl.toFixed(2)),
    pnlPct: Number(pnlPct.toFixed(2)),
    netPnl: Number(netPnl.toFixed(2)),
    fee: Number(totalFee.toFixed(2)),
  };
}

/**
 * Iceberg & TWAP Order Splitting:
 * Splits a large order size into multiple randomized tranches to minimize market impact and slippage.
 */
export function generateIcebergTranches(
  totalSize: number,
  numTranches: number = 4,
  variancePct: number = 15
): number[] {
  if (totalSize <= 0 || numTranches <= 1) return [totalSize];

  const baseSize = totalSize / numTranches;
  const tranches: number[] = [];
  let remaining = totalSize;

  for (let i = 0; i < numTranches - 1; i++) {
    // Generate variance between -variancePct% and +variancePct%
    const factor = 1 + ((Math.random() * 2 - 1) * (variancePct / 100));
    let tranche = Number((baseSize * factor).toFixed(4));
    
    // Safety guard
    if (tranche >= remaining) {
      tranche = Number((remaining * 0.5).toFixed(4));
    }
    tranches.push(tranche);
    remaining = Number((remaining - tranche).toFixed(4));
  }

  tranches.push(Number(remaining.toFixed(4)));
  return tranches;
}

/**
 * Calculates Comprehensive Performance Metrics:
 * Win Rate, Profit Factor, Sharpe Ratio, Sortino Ratio, Max Drawdown
 */
export function calculatePerformanceMetrics(
  trades: TradeResult[],
  initialBalance: number = 10000
) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      avgWinLossRatio: 0,
      expectancy: 0,
    };
  }

  let totalPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  
  let peakEquity = initialBalance;
  let currentEquity = initialBalance;
  let maxDrawdown = 0;

  const returns: number[] = [];

  for (const t of trades) {
    totalPnl += t.pnl;
    currentEquity += t.pnl;
    
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    returns.push(t.pnlPct);

    if (t.pnl > 0) {
      grossProfit += t.pnl;
      winningTrades++;
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      losingTrades++;
    }
  }

  const winRate = Number(((winningTrades / trades.length) * 100).toFixed(2));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0;
  
  const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
  const avgWinLossRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : avgWin > 0 ? 99.99 : 0;

  // Expectancy = (WinRate * AvgWin) - (LossRate * AvgLoss)
  const winRateFrac = winningTrades / trades.length;
  const lossRateFrac = losingTrades / trades.length;
  const expectancy = Number(((winRateFrac * avgWin) - (lossRateFrac * avgLoss)).toFixed(2));

  // Sharpe & Sortino calculation
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Downside deviation for Sortino
  const downsideReturns = returns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideStdDev = Math.sqrt(downsideVariance);

  const rawSharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : grossProfit > 0 ? 9.99 : 0;
  const rawSortino = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * Math.sqrt(252) : grossProfit > 0 ? 9.99 : 0;
  const sharpeRatio = Math.min(99.99, Math.max(-99.99, Number(rawSharpe.toFixed(2))));
  const sortinoRatio = Math.min(99.99, Math.max(-99.99, Number(rawSortino.toFixed(2))));

  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate,
    totalPnl: Number(totalPnl.toFixed(2)),
    totalPnlPct: Number(((totalPnl / initialBalance) * 100).toFixed(2)),
    profitFactor,
    maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
    sharpeRatio,
    sortinoRatio,
    avgWinLossRatio,
    expectancy,
  };
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  const recentTrs = trs.slice(-period);
  if (recentTrs.length === 0) return 0;
  const atr = recentTrs.reduce((sum, v) => sum + v, 0) / recentTrs.length;
  return Number(atr.toFixed(4));
}

/**
 * Evaluates Market Regime:
 * Determines if market is Trending Bull, Trending Bear, Ranging (low or high volatility), or News spike.
 */
export function evaluateMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < 20) return 'RANGING_LOW_VOL';

  const recentCandles = candles.slice(-20);
  const closes = recentCandles.map(c => c.close);
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const priceChangePct = ((lastClose - firstClose) / firstClose) * 100;

  const atr = calculateATR(recentCandles, 14);
  const avgPrice = closes.reduce((sum, p) => sum + p, 0) / closes.length;
  const relativeAtrPct = (atr / avgPrice) * 100;

  // Very high short-term volatility (News spike)
  if (relativeAtrPct > 3.0) {
    return 'NEWS_VOLATILITY';
  }

  // Strong trend threshold
  if (priceChangePct > 1.8) {
    return 'TRENDING_BULL';
  } else if (priceChangePct < -1.8) {
    return 'TRENDING_BEAR';
  }

  // Ranging conditions
  if (relativeAtrPct > 1.2) {
    return 'RANGING_HIGH_VOL';
  } else {
    return 'RANGING_LOW_VOL';
  }
}

/**
 * Adaptive Hyperparameter Optimizer (Self-Learning Day Trading Engine)
 * Automatically adapts lookbacks, stop-loss ATR multipliers, and target profit multipliers
 * based on current market regime and rolling performance.
 */
export interface StrategyHyperparameters {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  bollingerStd: number;
  atrSlMultiplier: number;
  tpMultiplier1: number;
  tpMultiplier2: number;
  tpMultiplier3: number;
  trailingStopMultiplier: number;
  riskPerTradePct: number;
}

export function getRecommendedParametersForRegime(
  regime: MarketRegime,
  baseParams?: Partial<StrategyHyperparameters>
): StrategyHyperparameters {
  const defaults: StrategyHyperparameters = {
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    bollingerStd: 2.0,
    atrSlMultiplier: 1.5,
    tpMultiplier1: 1.5,
    tpMultiplier2: 2.5,
    tpMultiplier3: 4.0,
    trailingStopMultiplier: 2.0,
    riskPerTradePct: 1.0,
    ...baseParams,
  };

  switch (regime) {
    case 'TRENDING_BULL':
    case 'TRENDING_BEAR':
      // In trending regimes, expand Take Profits and allow trailing stop to run further; tighten SL
      return {
        ...defaults,
        emaFast: 8,
        emaSlow: 21,
        rsiOverbought: 75,
        rsiOversold: 25,
        bollingerStd: 2.2,
        atrSlMultiplier: 1.3,
        tpMultiplier1: 2.0,
        tpMultiplier2: 3.5,
        tpMultiplier3: 6.0,
        trailingStopMultiplier: 1.8,
        riskPerTradePct: 1.2,
      };

    case 'RANGING_LOW_VOL':
      // In tight ranges, take fast profits (lower TP multipliers) and widen SL slightly to avoid chop
      return {
        ...defaults,
        emaFast: 7,
        emaSlow: 15,
        rsiOverbought: 68,
        rsiOversold: 32,
        bollingerStd: 1.8,
        atrSlMultiplier: 1.8,
        tpMultiplier1: 1.0,
        tpMultiplier2: 1.8,
        tpMultiplier3: 2.5,
        trailingStopMultiplier: 1.5,
        riskPerTradePct: 0.8,
      };

    case 'RANGING_HIGH_VOL':
      // In high vol range, reduce risk, wider SL to prevent whip
      return {
        ...defaults,
        emaFast: 12,
        emaSlow: 26,
        rsiOverbought: 72,
        rsiOversold: 28,
        bollingerStd: 2.4,
        atrSlMultiplier: 2.2,
        tpMultiplier1: 1.8,
        tpMultiplier2: 2.8,
        tpMultiplier3: 4.5,
        trailingStopMultiplier: 2.5,
        riskPerTradePct: 0.6,
      };

    case 'NEWS_VOLATILITY':
      // News spike regime: highly defensive settings
      return {
        ...defaults,
        emaFast: 15,
        emaSlow: 30,
        rsiOverbought: 80,
        rsiOversold: 20,
        bollingerStd: 3.0,
        atrSlMultiplier: 3.0,
        tpMultiplier1: 2.5,
        tpMultiplier2: 4.0,
        tpMultiplier3: 7.0,
        trailingStopMultiplier: 3.0,
        riskPerTradePct: 0.3,
      };

    default:
      return defaults;
  }
}

/**
 * Checks if a news blackout period is active
 */
export interface NewsItem {
  id: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: number;
}

export function isNewsBlackout(
  newsList: NewsItem[],
  currentTime: number = Date.now(),
  blackoutMinsBefore: number = 30,
  blackoutMinsAfter: number = 30
): { active: boolean; triggerNews?: NewsItem; minutesUntilOrAfter?: number } {
  const beforeMs = blackoutMinsBefore * 60 * 1000;
  const afterMs = blackoutMinsAfter * 60 * 1000;

  for (const news of newsList) {
    if (news.impact !== 'HIGH') continue;

    const diff = news.timestamp - currentTime;

    // Window: from 'beforeMs' before news until 'afterMs' after news
    if (diff <= beforeMs && diff >= -afterMs) {
      return {
        active: true,
        triggerNews: news,
        minutesUntilOrAfter: Math.round(diff / (60 * 1000)),
      };
    }
  }

  return { active: false };
}

/**
 * Checks session time blackout (e.g. Daily Rollover spread spike at 21:55 - 22:15 UTC, or weekend for Forex)
 */
export function isSessionBlackout(
  date: Date = new Date(),
  marketType: 'crypto_futures' | 'crypto_spot' | 'forex'
): { active: boolean; reason?: string } {
  const utcDay = date.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();

  if (marketType === 'forex') {
    // Forex closes Friday 21:00 UTC and reopens Sunday 21:00 UTC
    if (utcDay === 6) {
      return { active: true, reason: 'Forex Weekend Market Closed (Saturday)' };
    }
    if (utcDay === 5 && utcHours >= 21) {
      return { active: true, reason: 'Forex Weekend Closing Spread Spike (Friday Post-21:00 UTC)' };
    }
    if (utcDay === 0 && utcHours < 21) {
      return { active: true, reason: 'Forex Weekend Market Closed (Sunday Pre-21:00 UTC)' };
    }

    // Daily Broker Rollover Period (21:55 - 22:15 UTC): wide spreads
    if (utcHours === 21 && utcMinutes >= 55) {
      return { active: true, reason: 'Forex Daily Rollover Spread Spike (21:55 - 22:15 UTC)' };
    }
    if (utcHours === 22 && utcMinutes <= 15) {
      return { active: true, reason: 'Forex Daily Rollover Spread Spike (21:55 - 22:15 UTC)' };
    }
  }

  // Crypto futures: funding rate windows / low liquidity rollover check (optional buffer)
  return { active: false };
}
