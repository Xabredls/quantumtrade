import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BotId } from './types.ts';
import type { DataSource } from './binance-market.ts';

export interface Phase1Config {
  bots: BotId[];
  dataSource: DataSource;
  scanIntervalMs: number;
  klineInterval: string;
  volumeFilterUsd: number;
  confirmCandles: number;
  minTechScore: number;
  minAiConfidence: number;
  maxOrdersPerSymbol: number;
  maxOpenPerBot: number;
  entryCooldownMin: number;
  maxHoldHours: number;
  slAtrMult: number;
  tpAtrMult: number;
  maxNotionalUsd: number;
  breakerLosses: number;
  concurrency: number;
  maxSymbolsPerBot: number;
  aiMaxCandidates: number;
  feePct: Record<BotId, number>;
  dbPath: string;
  geminiApiKey: string;
  geminiModel: string;
}

const INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h'];

function num(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return def;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name}=${raw} ไม่ถูกต้อง (ต้องอยู่ระหว่าง ${min}–${max})`);
  return v;
}

/** Validates everything up front so a bad .env fails at startup, not mid-scan. */
export function loadConfig(env: NodeJS.ProcessEnv): Phase1Config {
  if (env.DRY_RUN === 'false') {
    throw new Error('Phase 1 เป็น paper-trading เท่านั้น — ต้องตั้ง DRY_RUN=true (ยังไม่รองรับการส่งออเดอร์จริงจากสแกนเนอร์)');
  }
  const bots = (env.PHASE1_BOTS || 'futures,spot,forex').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const b of bots) if (!['futures', 'spot', 'forex'].includes(b)) throw new Error(`PHASE1_BOTS มีค่าที่ไม่รู้จัก: ${b}`);
  const dataSource = (env.DATA_SOURCE || 'live') as DataSource;
  if (dataSource !== 'live' && dataSource !== 'testnet') throw new Error('DATA_SOURCE ต้องเป็น live หรือ testnet');
  const klineInterval = env.KLINE_INTERVAL || '15m';
  if (!INTERVALS.includes(klineInterval)) throw new Error(`KLINE_INTERVAL ต้องเป็นหนึ่งใน ${INTERVALS.join(',')}`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    bots: bots as BotId[],
    dataSource,
    scanIntervalMs: num(env, 'SCAN_INTERVAL_MS', 300_000, 60_000, 3_600_000),
    klineInterval,
    volumeFilterUsd: num(env, 'VOLUME_FILTER_USD', 5_000_000, 0, 1e12),
    confirmCandles: num(env, 'CONFIRM_CANDLES', 3, 1, 6),
    minTechScore: num(env, 'MIN_TECH_SCORE', 0.65, 0.3, 1),
    minAiConfidence: num(env, 'MIN_AI_CONFIDENCE', 0.6, 0.5, 1),
    maxOrdersPerSymbol: num(env, 'MAX_ORDERS_PER_SYMBOL', 3, 1, 10),
    maxOpenPerBot: num(env, 'MAX_OPEN_PER_BOT', 20, 1, 200),
    entryCooldownMin: num(env, 'ENTRY_COOLDOWN_MIN', 15, 0, 1440),
    maxHoldHours: num(env, 'MAX_HOLD_HOURS', 24, 1, 168),
    slAtrMult: num(env, 'SL_ATR_MULT', 1.5, 0.5, 10),
    tpAtrMult: num(env, 'TP_ATR_MULT', 2.25, 0.5, 20),
    maxNotionalUsd: num(env, 'MAX_NOTIONAL_USD', 50, 1, 100_000),
    breakerLosses: num(env, 'BREAKER_LOSSES', 3, 1, 50),
    concurrency: num(env, 'SCAN_CONCURRENCY', 8, 1, 20),
    maxSymbolsPerBot: num(env, 'MAX_SYMBOLS_PER_BOT', 300, 1, 1000),
    aiMaxCandidates: num(env, 'AI_MAX_CANDIDATES', 30, 1, 100),
    feePct: { futures: num(env, 'FEE_PCT_FUTURES', 0.05, 0, 1), spot: num(env, 'FEE_PCT_SPOT', 0.1, 0, 1), forex: 0 },
    dbPath: env.PHASE1_DB || path.join(here, 'data', 'learning.db'),
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}
