import { BinanceMarket } from './binance-market.ts';
import { loadConfig } from './config.ts';
import { Phase1Engine } from './engine.ts';
import { ForexMock } from './forex-mock.ts';
import { GeminiAnalyzer } from './gemini.ts';
import { openStore } from './store.ts';
import type { Store } from './store.ts';
import type { BotId, MarketProvider } from './types.ts';
import { handlePhase1 as handle } from './api.ts';
import type http from 'node:http';

export interface Phase1Handle { engine: Phase1Engine; store: Store; stop(): Promise<void> }

/** Returns null when PHASE1_ENABLED is not "true". Throws on invalid config (caller decides how to report). */
export async function startPhase1(env: NodeJS.ProcessEnv): Promise<Phase1Handle | null> {
  if (env.PHASE1_ENABLED !== 'true') return null;
  const cfg = loadConfig(env);
  const store = await openStore(cfg.dbPath);
  const providers: Partial<Record<BotId, MarketProvider & { tick?: () => void }>> = {};
  for (const bot of cfg.bots) {
    providers[bot] = bot === 'forex'
      ? new ForexMock(cfg.scanIntervalMs)
      : new BinanceMarket(bot, { dataSource: cfg.dataSource, minQuoteVolume: cfg.volumeFilterUsd, maxSymbols: cfg.maxSymbolsPerBot });
  }
  const ai = cfg.geminiApiKey ? new GeminiAnalyzer({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel }) : null;
  const engine = new Phase1Engine({ cfg, store, providers, ai });
  engine.init();
  console.log(`[phase1] เริ่มทำงาน (paper/DRY_RUN) bots=${cfg.bots.join(',')} data=${cfg.dataSource} interval=${cfg.klineInterval} scan=${cfg.scanIntervalMs / 1000}s AI=${ai ? cfg.geminiModel : 'ปิด (ไม่มี GEMINI_API_KEY → ไม่เปิดตำแหน่งใดๆ)'}`);
  engine.start();
  return { engine, store, stop: () => engine.stop() };
}

export const handlePhase1 = (req: http.IncomingMessage, res: http.ServerResponse, h: Phase1Handle) => handle(req, res, h.engine, h.store);
