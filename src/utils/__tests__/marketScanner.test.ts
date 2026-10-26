import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  scanMarketOpportunity, 
  scanWholeMarket, 
  selectBestOpportunityForAutoEntry, 
  getDataSourceInfo, 
  DEFAULT_RISK_CONTROLLER 
} from '../marketScanner.ts';
import { TradableSymbol, Position } from '../../types/trading.ts';

describe('Market Scanner & Multi-Order Risk Guard', () => {
  const sampleFuturesSymbol: TradableSymbol = {
    symbol: 'SOL/USDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    marketType: 'crypto_futures',
    currentPrice: 182.40,
    change24h: 3.5,
    high24h: 189.50,
    low24h: 178.20,
    volume24h: 450000000,
    fundingRate: 0.0001,
    contractSize: 1,
    tickSize: 0.01,
    minQty: 0.1,
    leverageMax: 25,
    dataSource: 'Binance Futures (USDⓈ-M API v3)',
    feedLatencyMs: 38,
  };

  const sampleSpotSymbol: TradableSymbol = {
    symbol: 'ETH/USDT (Spot)',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    marketType: 'crypto_spot',
    currentPrice: 3540.00,
    change24h: 4.2,
    high24h: 3590.00,
    low24h: 3385.00,
    volume24h: 580000000,
    fundingRate: 0,
    contractSize: 1,
    tickSize: 0.01,
    minQty: 0.001,
    leverageMax: 1,
    dataSource: 'Binance Spot (API v3)',
    feedLatencyMs: 29,
  };

  test('Data Source Info returns correct exchange provenance and endpoint', () => {
    const futuresDs = getDataSourceInfo('crypto_futures');
    assert.strictEqual(futuresDs.shortLabel, 'Binance Futures');
    assert.strictEqual(futuresDs.apiEndpoint, 'https://fapi.binance.com/fapi/v1');

    const spotDs = getDataSourceInfo('crypto_spot');
    assert.strictEqual(spotDs.shortLabel, 'Binance Spot');
    assert.strictEqual(spotDs.apiEndpoint, 'https://api.binance.com/api/v3');

    const forexDs = getDataSourceInfo('forex');
    assert.strictEqual(forexDs.shortLabel, 'OANDA Interbank');
  });

  test('Calculates opportunity score and recommends directional trade', () => {
    const result = scanMarketOpportunity(sampleFuturesSymbol, [], DEFAULT_RISK_CONTROLLER, 10000, false);
    assert.ok(result.signalScore >= 50 && result.signalScore <= 100);
    assert.ok(result.dataSource.includes('Binance Futures'));
    assert.strictEqual(result.recommendedSide, 'LONG');
    assert.strictEqual(result.isEligibleForNewOrder, true);
  });

  test('Strictly enforces max positions cap to prevent uncontrolled over-ordering', () => {
    const mockPositions: Position[] = [
      { id: '1', accountId: 'acc', symbol: 'BTC/USDT', marketType: 'crypto_futures', side: 'LONG', entryPrice: 68000, currentPrice: 68500, size: 0.1, leverage: 10, margin: 680, stopLossPrice: 68000, takeProfit1: 70000, takeProfit2: 71000, takeProfit3: 72000, liquidationPrice: 61000, openTime: 0, unrealizedPnl: 50, unrealizedPnlPct: 7.3, isTrailingActive: true, peakPriceSinceEntry: 68500 },
      { id: '2', accountId: 'acc', symbol: 'ETH/USDT', marketType: 'crypto_futures', side: 'LONG', entryPrice: 3500, currentPrice: 3550, size: 1, leverage: 10, margin: 350, stopLossPrice: 3500, takeProfit1: 3700, takeProfit2: 3800, takeProfit3: 3900, liquidationPrice: 3100, openTime: 0, unrealizedPnl: 50, unrealizedPnlPct: 14.2, isTrailingActive: true, peakPriceSinceEntry: 3550 },
      { id: '3', accountId: 'acc', symbol: 'BNB/USDT', marketType: 'crypto_futures', side: 'LONG', entryPrice: 590, currentPrice: 595, size: 2, leverage: 10, margin: 118, stopLossPrice: 590, takeProfit1: 610, takeProfit2: 620, takeProfit3: 630, liquidationPrice: 530, openTime: 0, unrealizedPnl: 10, unrealizedPnlPct: 8.4, isTrailingActive: true, peakPriceSinceEntry: 595 },
      { id: '4', accountId: 'acc', symbol: 'XRP/USDT', marketType: 'crypto_futures', side: 'LONG', entryPrice: 0.58, currentPrice: 0.59, size: 100, leverage: 10, margin: 58, stopLossPrice: 0.58, takeProfit1: 0.62, takeProfit2: 0.64, takeProfit3: 0.66, liquidationPrice: 0.52, openTime: 0, unrealizedPnl: 1, unrealizedPnlPct: 1.7, isTrailingActive: true, peakPriceSinceEntry: 0.59 },
    ];

    // Already at 4/4 max open positions
    const result = scanMarketOpportunity(sampleFuturesSymbol, mockPositions, DEFAULT_RISK_CONTROLLER, 10000, false);
    assert.strictEqual(result.isEligibleForNewOrder, false);
    assert.ok(result.rejectReason?.includes('เต็มเพดานความจุคำสั่งสูงสุด'));
  });

  test('Blocks new order when in News Blackout period', () => {
    const result = scanMarketOpportunity(sampleFuturesSymbol, [], DEFAULT_RISK_CONTROLLER, 10000, true);
    assert.strictEqual(result.isEligibleForNewOrder, false);
    assert.ok(result.rejectReason?.includes('News Blackout'));
  });

  test('Ranks opportunities and picks the top candidate', () => {
    const symbols = [sampleFuturesSymbol, sampleSpotSymbol];
    const scanned = scanWholeMarket(symbols, [], DEFAULT_RISK_CONTROLLER, 10000);
    assert.strictEqual(scanned.length, 2);
    assert.ok(scanned[0].signalScore >= scanned[1].signalScore);
  });
});
