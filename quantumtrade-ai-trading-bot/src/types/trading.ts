export type MarketType = 'crypto_futures' | 'crypto_spot' | 'forex';

export type ExecutionMode = 'paper' | 'live';

export type OrderSide = 'LONG' | 'SHORT';

export type OrderType = 'MARKET' | 'LIMIT' | 'ICEBERG';

export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED';

export interface CryptoSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketType: 'crypto_futures' | 'crypto_spot';
  currentPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  fundingRate: number;
  contractSize: number;
  tickSize: number;
  minQty: number;
  leverageMax: number;
}

export interface ForexSymbol {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  marketType: 'forex';
  currentPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  spreadPips: number;
  pipValue: number;
  lotSize: number;
  leverageMax: number;
}

export type TradableSymbol = CryptoSymbol | ForexSymbol;

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  marketType: MarketType;
  side: OrderSide;
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  margin: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  liquidationPrice: number;
  openTime: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  isTrailingActive: boolean;
  trailingActivationPrice?: number;
  peakPriceSinceEntry: number;
}

export interface ActiveOrder {
  id: string;
  accountId: string;
  symbol: string;
  marketType: MarketType;
  side: OrderSide;
  type: OrderType;
  price: number;
  totalSize: number;
  filledSize: number;
  status: OrderStatus;
  tranchesTotal?: number;
  tranchesFilled?: number;
  createdAt: number;
}

export interface AccountPortfolio {
  id: string;
  name: string;
  marketType: MarketType;
  exchange: 'Binance Futures' | 'Bybit' | 'MetaTrader 5' | 'OANDA';
  balance: number;
  equity: number;
  initialBalance: number;
  leverage: number;
  isPaper: boolean;
  isActive: boolean;
  apiKeyMasked: string;
  apiSecretMasked: string;
}

export interface NewsBlackoutEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: number;
  description: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnTradeOpen: boolean;
  notifyOnTpSlHit: boolean;
  notifyOnNewsBlackout: boolean;
  notifyDailySummary: boolean;
  notifyRiskAlert: boolean;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';
  lastTestMessage?: string;
}

export interface SystemRiskConfig {
  maxRiskPerTradePct: number;
  maxDailyDrawdownPct: number;
  circuitBreakerActive: boolean;
  orderSplittingEnabled: boolean;
  icebergTranchesCount: number;
  slippageTolerancePct: number;
  newsBlackoutMinutesBefore: number;
  newsBlackoutMinutesAfter: number;
  avoidRolloverHours: boolean;
  masterPasswordSet: boolean;
  autoDailyBackupEnabled: boolean;
  lastBackupTimestamp?: number;
}

export interface ExecutionLogItem {
  id: string;
  timestamp: number;
  marketType: MarketType;
  symbol: string;
  type: 'ORDER_OPEN' | 'ORDER_CLOSE' | 'TP_HIT' | 'SL_HIT' | 'NEWS_BLACKOUT' | 'SELF_LEARN' | 'CIRCUIT_BREAKER' | 'SYSTEM';
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
  details?: Record<string, any>;
}

export interface SelfLearningMetric {
  generation: number;
  timestamp: number;
  regime: string;
  winRate: number;
  profitFactor: number;
  adaptedParams: Record<string, number>;
  improvementPct: number;
  notes: string;
}
