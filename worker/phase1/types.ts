export type BotId = 'futures' | 'spot' | 'forex';
export type Side = 'BUY' | 'SELL';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface SymbolInfo {
  symbol: string;
  /** 24h quote volume in USD (null for the forex mock) */
  quoteVolume: number | null;
}

export interface SymbolList {
  /** number of tradable symbols before the volume filter */
  universe: number;
  symbols: SymbolInfo[];
}

export interface MarketProvider {
  readonly bot: BotId;
  listSymbols(): Promise<SymbolList>;
  candles(symbol: string, interval: string, limit: number): Promise<Candle[]>;
}

export interface Candidate {
  bot: BotId;
  symbol: string;
  side: Side;
  techScore: number;
  price: number;
  atr: number;
  rsi: number;
  macdHist: number;
  emaFast: number;
  emaSlow: number;
  quoteVolume: number | null;
  reasons: string[];
}

export interface AiVerdict {
  key: string;
  decision: Side | 'SKIP';
  confidence: number;
  rationale: string;
}

export interface AiAnalyzer {
  readonly model: string;
  analyze(candidates: Candidate[]): Promise<Map<string, AiVerdict>>;
}

export const keyOf = (c: { bot: BotId; symbol: string }) => `${c.bot}:${c.symbol}`;
