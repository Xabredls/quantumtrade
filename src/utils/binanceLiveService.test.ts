import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMicroPositionSize } from './binanceLiveService';

test('calculates exact 1% risk ($1.00) sizing for $100 Binance Futures account', () => {
  const result = calculateMicroPositionSize({
    botCapital: 100,
    riskPct: 1.0,
    entryPrice: 68000,
    stopLossPrice: 67320, // 1% SL distance ($680)
    leverage: 10,
  });

  assert.equal(result.maxRiskUsd, 1.00);
  assert.ok(result.marginUsd <= 25.00, 'Margin should not exceed 25% of bot capital');
  assert.ok(result.size > 0, 'Size must be positive');
  assert.equal(result.size, 0.0015);
});

test('calculates Spot 1x sizing for $100 Crypto Spot account', () => {
  const result = calculateMicroPositionSize({
    botCapital: 100,
    riskPct: 1.0,
    entryPrice: 3500,
    stopLossPrice: 3430, // 2% SL distance ($70)
    leverage: 1,
  });

  assert.equal(result.maxRiskUsd, 1.00);
  assert.ok(result.marginUsd <= 25.00);
  assert.equal(result.notionalUsd, result.marginUsd);
});

test('calculates Forex Gold 20x sizing for $100 Forex account', () => {
  const result = calculateMicroPositionSize({
    botCapital: 100,
    riskPct: 1.0,
    entryPrice: 2700,
    stopLossPrice: 2680, // $20 SL distance
    leverage: 20,
  });

  assert.equal(result.maxRiskUsd, 1.00);
  assert.ok(result.marginUsd <= 25.00);
});
