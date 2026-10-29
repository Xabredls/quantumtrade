import { BinanceFutures } from '../core/binance-futures.js';
import { BinanceSpot } from '../core/binance-spot.js';
import { ForexMock } from '../core/forex-mock.js';
import { TechnicalIndicators } from './technical-indicators.js';
import { ScanResult } from '../core/exchange-base.js';

export interface ScanRound {
  timestamp: number;
  futures: { symbols: ScanResult[]; signals: Array<{ symbol: string; signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> };
  spot: { symbols: ScanResult[]; signals: Array<{ symbol: string; signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> };
  forex: { symbols: ScanResult[]; signals: Array<{ symbol: string; signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> };
}

export class MarketScanner {
  private futures: BinanceFutures;
  private spot: BinanceSpot;
  private forex: ForexMock;
  private volumeFilter: number;

  constructor(apiKey: string, apiSecret: string, volumeFilterUsd = 5_000_000) {
    this.futures = new BinanceFutures('testnet', apiKey, apiSecret);
    this.spot = new BinanceSpot('testnet', apiKey, apiSecret);
    this.forex = new ForexMock();
    this.volumeFilter = volumeFilterUsd;
  }

  async getTopSymbols(botType: 'futures' | 'spot', limit = 50): Promise<string[]> {
    // Top trading pairs by volume
    const topPairs: Record<string, string[]> = {
      futures: [
        'BTCUSDT',
        'ETHUSDT',
        'BNBUSDT',
        'XRPUSDT',
        'ADAUSDT',
        'DOGEUSDT',
        'SOLSDT',
        'LITUSDT',
        'AVAXUSDT',
        'POLSDT',
        'MATICUSDT',
        'LINKUSDT',
        'UNIUSDT',
        'ATOMUSDT',
        'ARBUSDT',
      ],
      spot: [
        'BTCBUSD',
        'ETHBUSD',
        'BNBBUSD',
        'XRPBUSD',
        'ADABUSD',
        'DOGEBUSD',
        'SOLBUSD',
        'LITBUSD',
        'AVAXBUSD',
        'POLBUSD',
      ],
    };

    return (topPairs[botType] || []).slice(0, limit);
  }

  async scanRound(): Promise<ScanRound> {
    console.log('\n🔍 [SCANNER] Starting scan round...');

    // Parallel scan all 3 bots
    const [futuresSymbols, spotSymbols] = await Promise.all([
      this.getTopSymbols('futures'),
      this.getTopSymbols('spot'),
    ]);

    const forexSymbols = ['EURUSD', 'GBPUSD', 'JPYUSD', 'XAUUSD', 'XAGUSD'];

    const [futuresResults, spotResults, forexResults] = await Promise.all([
      this.futures.scan(futuresSymbols),
      this.spot.scan(spotSymbols),
      this.forex.scan(forexSymbols),
    ]);

    console.log(
      `  ✅ Futures: ${futuresResults.length} symbols, Spot: ${spotResults.length} symbols, Forex: ${forexResults.length} symbols`
    );

    // Filter by volume & generate signals
    const futuresSignals = this.processResults(futuresResults);
    const spotSignals = this.processResults(spotResults);
    const forexSignals = this.processResults(forexResults);

    return {
      timestamp: Date.now(),
      futures: { symbols: futuresResults, signals: futuresSignals },
      spot: { symbols: spotResults, signals: spotSignals },
      forex: { symbols: forexResults, signals: forexSignals },
    };
  }

  private processResults(results: ScanResult[]): Array<{ symbol: string; signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> {
    return results
      .filter((r) => r.volume24h > this.volumeFilter)
      .map((r) => {
        const { signal, confidence } = TechnicalIndicators.generateSignal(r.symbol, r.price, r.ma20, r.ma50, r.rsi, r.macdHist, r.volume24h);
        return { symbol: r.symbol, signal, confidence };
      })
      .filter((s) => s.signal !== 'HOLD' || s.confidence > 0.5);
  }

  async getBotStatus(): Promise<{ futures: string; spot: string; forex: string }> {
    try {
      const [futuresTime, futuresBalance, spotBalance, forexBalance] = await Promise.all([
        this.futures.serverTime(),
        this.futures.getBalance(),
        this.spot.getBalance(),
        this.forex.getBalance(),
      ]);

      return {
        futures: `✅ Connected (${futuresBalance})`,
        spot: `✅ Connected (${spotBalance})`,
        forex: `✅ Connected (${forexBalance})`,
      };
    } catch (e) {
      return {
        futures: `❌ Error: ${String(e).slice(0, 30)}`,
        spot: `❌ Error`,
        forex: `✅ Mock (no auth needed)`,
      };
    }
  }
}
