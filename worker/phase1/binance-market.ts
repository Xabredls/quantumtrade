import { GeoBlockedError } from '../binance.ts';
import type { BotId, Candle, MarketProvider, SymbolList } from './types.ts';

export class RateLimitError extends Error {
  constructor(message: string, public retryAfterSec: number) { super(message); }
}

export type Venue = 'spot' | 'futures';
export type DataSource = 'live' | 'testnet';

const BASES: Record<DataSource, Record<Venue, string>> = {
  live: { spot: 'https://api.binance.com', futures: 'https://fapi.binance.com' },
  testnet: { spot: 'https://testnet.binance.vision', futures: 'https://testnet.binancefuture.com' },
};
const PATHS: Record<Venue, { info: string; ticker: string; klines: string }> = {
  spot: { info: '/api/v3/exchangeInfo', ticker: '/api/v3/ticker/24hr', klines: '/api/v3/klines' },
  futures: { info: '/fapi/v1/exchangeInfo', ticker: '/fapi/v1/ticker/24hr', klines: '/fapi/v1/klines' },
};

// Stablecoins and fiat-like bases never trend, so they only waste requests.
const EXCLUDED_BASES = new Set([
  'USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'USDE', 'BUSD', 'USD1', 'AEUR', 'EURI', 'XUSD', 'RLUSD',
  'EUR', 'GBP', 'AUD', 'TRY', 'BRL', 'RUB', 'UAH', 'PLN', 'RON', 'ARS', 'CZK', 'MXN', 'ZAR', 'JPY',
]);
const INFO_TTL_MS = 6 * 3600_000;

/** Public market data only — no API key is sent or needed. */
export class BinanceMarket implements MarketProvider {
  readonly bot: BotId;
  private tradable: { at: number; symbols: Set<string> } | null = null;
  private blockedUntil = 0;
  private base: string;

  constructor(
    private venue: Venue,
    private opts: { dataSource: DataSource; minQuoteVolume: number; maxSymbols: number; baseUrl?: string },
  ) {
    this.bot = venue;
    this.base = opts.baseUrl ?? BASES[opts.dataSource][venue];
  }

  private async get(path: string, params: Record<string, string | number> = {}) {
    if (Date.now() < this.blockedUntil) {
      throw new RateLimitError(`Binance ${this.venue}: ยังอยู่ในช่วงพักจาก rate limit`, Math.ceil((this.blockedUntil - Date.now()) / 1000));
    }
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const res = await fetch(`${this.base}${path}${qs ? `?${qs}` : ''}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 || res.status === 418) {
      const ra = Number(res.headers.get('retry-after')) || 60;
      this.blockedUntil = Date.now() + ra * 1000;
      throw new RateLimitError(`Binance ${this.venue} ${res.status}: rate limited`, ra);
    }
    const text = await res.text();
    if (res.status === 451 || /restricted location/i.test(text)) {
      throw new GeoBlockedError('Binance ปฏิเสธเพราะตำแหน่งของเครื่อง (HTTP 451) — ต้องรัน worker ในที่ที่ใช้งานได้');
    }
    if (!res.ok) throw new Error(`Binance ${this.venue} ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  private async tradableSymbols(): Promise<Set<string>> {
    if (this.tradable && Date.now() - this.tradable.at < INFO_TTL_MS) return this.tradable.symbols;
    const info = await this.get(PATHS[this.venue].info);
    const symbols = new Set<string>(
      (info.symbols as any[])
        .filter((s) =>
          s.quoteAsset === 'USDT' && s.status === 'TRADING' && !EXCLUDED_BASES.has(String(s.baseAsset).toUpperCase()) &&
          (this.venue === 'futures' ? s.contractType === 'PERPETUAL' : s.isSpotTradingAllowed !== false))
        .map((s) => s.symbol as string),
    );
    this.tradable = { at: Date.now(), symbols };
    return symbols;
  }

  async listSymbols(): Promise<SymbolList> {
    const tradable = await this.tradableSymbols();
    const tickers = (await this.get(PATHS[this.venue].ticker)) as Array<{ symbol: string; quoteVolume: string }>;
    const symbols = tickers
      .filter((t) => tradable.has(t.symbol))
      .map((t) => ({ symbol: t.symbol, quoteVolume: Number(t.quoteVolume) }))
      .filter((t) => Number.isFinite(t.quoteVolume) && t.quoteVolume >= this.opts.minQuoteVolume)
      .sort((a, b) => (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0))
      .slice(0, this.opts.maxSymbols);
    return { universe: tradable.size, symbols };
  }

  async candles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    const rows = (await this.get(PATHS[this.venue].klines, { symbol, interval, limit })) as any[][];
    return rows.map((k) => ({
      openTime: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]),
      close: parseFloat(k[4]), volume: parseFloat(k[5]), closeTime: Number(k[6]),
    }));
  }
}
