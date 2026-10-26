import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePositionSize,
  calculateLiquidationPrice,
  calculateUnrealizedPnl,
  generateIcebergTranches,
  calculatePerformanceMetrics,
  calculateATR,
  evaluateMarketRegime,
  getRecommendedParametersForRegime,
  isNewsBlackout,
  isSessionBlackout,
  TradeResult,
  Candle,
} from './tradingMath';

test('calculatePositionSize accurately sizes fixed fractional risk', () => {
  const equity = 10000;
  const riskPct = 1.0; // $100 risk
  const entryPrice = 50000;
  const stopLossPrice = 49000; // $1000 distance
  const leverage = 10;

  const result = calculatePositionSize(equity, riskPct, entryPrice, stopLossPrice, leverage);
  
  assert.equal(result.riskAmount, 100);
  assert.equal(result.size, 0.1); // 100 / 1000 = 0.1 BTC
  assert.equal(result.notional, 5000); // 0.1 * 50000 = 5000
  assert.equal(result.marginRequired, 500); // 5000 / 10 = 500
});

test('calculateLiquidationPrice handles Long and Short with maintenance margin', () => {
  const entryPrice = 60000;
  const leverage = 20; // 5% margin
  const mmr = 0.005; // 0.5% MMR

  const longLiq = calculateLiquidationPrice(entryPrice, 'LONG', leverage, mmr);
  // Liq = 60000 * (1 - 0.05 + 0.005) = 60000 * 0.955 = 57300
  assert.equal(longLiq, 57300);

  const shortLiq = calculateLiquidationPrice(entryPrice, 'SHORT', leverage, mmr);
  // Liq = 60000 * (1 + 0.05 - 0.005) = 60000 * 1.045 = 62700
  assert.equal(shortLiq, 62700);
});

test('calculateUnrealizedPnl calculates gross, net with fee, and ROE %', () => {
  const entryPrice = 2000;
  const currentPrice = 2100; // +100
  const size = 1;
  const leverage = 10; // initial margin = 200
  const feeRate = 0.0004;

  const result = calculateUnrealizedPnl(entryPrice, currentPrice, size, 'LONG', leverage, feeRate);
  assert.equal(result.pnl, 100);
  // Entry fee: 2000 * 0.0004 = 0.8, Exit fee: 2100 * 0.0004 = 0.84 -> total fee 1.64
  assert.equal(result.fee, 1.64);
  assert.equal(result.netPnl, 98.36);
  assert.ok(result.pnlPct > 49); // (98.36 / 200) * 100 ≈ 49.18%
});

test('generateIcebergTranches splits large orders and preserves total sum', () => {
  const totalSize = 10;
  const numTranches = 4;
  const tranches = generateIcebergTranches(totalSize, numTranches, 10);
  
  assert.equal(tranches.length, numTranches);
  const sum = tranches.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - totalSize) < 0.01);
});

test('calculatePerformanceMetrics produces win rate, profit factor and max drawdown', () => {
  const mockTrades: TradeResult[] = [
    { pnl: 200, pnlPct: 5, entryPrice: 100, exitPrice: 105, size: 2, side: 'LONG', fee: 2, holdingTimeBars: 5 },
    { pnl: 150, pnlPct: 3.75, entryPrice: 100, exitPrice: 103.75, size: 2, side: 'LONG', fee: 2, holdingTimeBars: 4 },
    { pnl: -100, pnlPct: -2.5, entryPrice: 100, exitPrice: 97.5, size: 2, side: 'LONG', fee: 2, holdingTimeBars: 3 },
    { pnl: 300, pnlPct: 7.5, entryPrice: 100, exitPrice: 107.5, size: 2, side: 'LONG', fee: 2, holdingTimeBars: 6 },
  ];

  const metrics = calculatePerformanceMetrics(mockTrades, 10000);
  assert.equal(metrics.totalTrades, 4);
  assert.equal(metrics.winningTrades, 3);
  assert.equal(metrics.losingTrades, 1);
  assert.equal(metrics.winRate, 75);
  assert.equal(metrics.totalPnl, 550);
  assert.equal(metrics.profitFactor, 6.5); // 650 / 100 = 6.5
});

test('isNewsBlackout triggers when inside blackout window', () => {
  const now = Date.now();
  const newsList = [
    {
      id: 'news-1',
      title: 'US CPI Release',
      currency: 'USD',
      impact: 'HIGH' as const,
      timestamp: now + 15 * 60 * 1000, // 15 mins in future
    },
  ];

  const checkInside = isNewsBlackout(newsList, now, 30, 30);
  assert.equal(checkInside.active, true);
  assert.equal(checkInside.triggerNews?.title, 'US CPI Release');

  const checkOutside = isNewsBlackout(newsList, now - 60 * 60 * 1000, 30, 30);
  assert.equal(checkOutside.active, false);
});

test('isSessionBlackout detects Forex weekend and rollover windows', () => {
  // Saturday
  const saturday = new Date('2026-10-24T12:00:00Z');
  const satCheck = isSessionBlackout(saturday, 'forex');
  assert.equal(satCheck.active, true);

  // Normal Wednesday trading hour
  const wednesday = new Date('2026-10-21T14:30:00Z');
  const wedCheck = isSessionBlackout(wednesday, 'forex');
  assert.equal(wedCheck.active, false);
});

test('getRecommendedParametersForRegime provides tailored hyperparameters', () => {
  const trendingParams = getRecommendedParametersForRegime('TRENDING_BULL');
  const rangingParams = getRecommendedParametersForRegime('RANGING_LOW_VOL');
  
  assert.ok(trendingParams.tpMultiplier3 > rangingParams.tpMultiplier3);
  assert.ok(trendingParams.atrSlMultiplier < rangingParams.atrSlMultiplier);
});

test('runHistoricalBacktest executes full cycle and produces metrics and equity curve', async () => {
  const { runHistoricalBacktest } = await import('./backtestEngine');
  const res = runHistoricalBacktest({
    symbol: 'BTC/USDT',
    marketType: 'crypto_futures',
    strategy: 'dynamic_ema_vwap',
    timeframe: '5m',
    durationLabel: '1 Month',
    candleCount: 200,
    initialBalance: 10000,
    leverage: 10,
    riskPerTradePct: 1,
    slippagePct: 0.02,
    feeRatePct: 0.04,
    enableTrailingStop: true,
    enableMonteCarlo: true,
    enableAiConfluenceFilter: true,
  });

  assert.ok(res.candles.length > 50);
  assert.ok(res.equityCurve.length > 0);
  assert.ok(typeof res.metrics.winRate === 'number');
  assert.ok(res.monteCarlo !== undefined);
  assert.ok(res.monteCarlo.probabilityOfProfit > 50);
});

test('updateEnsembleWeights adjusts weights and preserves unit sum', async () => {
  const { updateEnsembleWeights, INITIAL_STRATEGY_MODULES } = await import('./aiLearningEngine');
  const mockEpisode = {
    id: 'ep-1',
    timestamp: Date.now(),
    marketType: 'crypto_futures' as const,
    symbol: 'BTC/USDT',
    features: { rsi: 30, atrRatio: 1.2, regime: 'TRENDING_BULL', volatility: 0.02, spread: 0.5 },
    chosenStrategyId: 'mod-trend-vwap',
    action: 'LONG' as const,
    entryPrice: 60000,
    exitPrice: 61000,
    rewardPnl: 100,
    isWin: true,
  };

  const updated = updateEnsembleWeights(INITIAL_STRATEGY_MODULES, mockEpisode);
  const sum = updated.reduce((s, x) => s + x.weight, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.01);
  const vwapMod = updated.find(m => m.id === 'mod-trend-vwap');
  assert.ok((vwapMod?.weight ?? 0) >= 0.35);
});

test('synthesizeEnsembleSignal generates weighted action and confidence', async () => {
  const { synthesizeEnsembleSignal, INITIAL_STRATEGY_MODULES, INITIAL_CUSTOM_RULES } = await import('./aiLearningEngine');
  const signal = synthesizeEnsembleSignal(
    INITIAL_STRATEGY_MODULES,
    INITIAL_CUSTOM_RULES,
    { rsi: 25, ema9: 61000, ema21: 60000, vwap: 60500, price: 61200, atr: 150 }
  );

  assert.equal(signal.action, 'LONG');
  assert.ok(signal.confidenceScore >= 50);
  assert.ok(signal.contributingModules.length > 0);
});


