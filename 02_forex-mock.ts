import { ExchangeBase, TradeSignal, ScanResult } from './exchange-base.js';

interface MockPair {
  symbol: string;
  basePrice: number;
  volatility: number;
  trend: number;
}

export class ForexMock extends ExchangeBase {
  private mockData: Map<string, MockPair> = new Map();
  private history: Map<string, number[]> = new Map();

  constructor() {
    super('testnet', 'forex-mock', 'forex-mock');
    this.initializeMockPairs();
  }

  private initializeMockPairs(): void {
    const pairs: MockPair[] = [
      { symbol: 'EURUSD', basePrice: 1.09, volatility: 0.003, trend: 0.0001 },
      { symbol: 'GBPUSD', basePrice: 1.27, volatility: 0.004, trend: 0.00015 },
      { symbol: 'JPYUSD', basePrice: 150.5, volatility: 0.5, trend: 0.05 },
      { symbol: 'XAUUSD', basePrice: 2050, volatility: 15, trend: 1 },
      { symbol: 'XAGUSD', basePrice: 25, volatility: 0.3, trend: 0.05 },
    ];

    pairs.forEach((p) => {
      this.mockData.set(p.symbol, p);
      this.history.set(p.symbol, [p.basePrice]);
    });
  }

  async serverTime(): Promise<number> {
    return Date.now();
  }

  async getBalance(): Promise<string> {
    return '10000 USD (Mock)';
  }

  async scan(symbols: string[]): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    for (const sym of symbols) {
      const pair = this.mockData.get(sym);
      if (!pair) continue;

      const history = this.history.get(sym) || [];
      if (history.length < 100) {
        // Generate realistic OHLC
        for (let i = history.length; i < 100; i++) {
          const lastPrice = history[history.length - 1];
          const change = (Math.random() - 0.5) * pair.volatility * 2 + pair.trend;
          const newPrice = Math.max(lastPrice * 0.8, lastPrice * (1 + change));
          history.push(newPrice);
        }
      }

      const closes = history.slice(-100);
      const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const rsi = this.calcRSI(closes);
      const macdHist = this.calcMACD(closes);

      // Mock volume (in contract units)
      const volume24h = Math.random() * 50_000_000 + 5_000_000;

      results.push({
        symbol: sym,
        price: closes[closes.length - 1],
        ma20,
        ma50,
        rsi,
        macdHist,
        volume24h,
        timestamp: Date.now(),
      });

      // Advance mock price
      if (history.length >= 100) {
        const lastPrice = history[history.length - 1];
        const change = (Math.random() - 0.5) * pair.volatility * 2 + pair.trend;
        const newPrice = Math.max(lastPrice * 0.8, lastPrice * (1 + change));
        history.push(newPrice);
        history.shift();
      }
    }

    return results;
  }

  async placeOrder(signal: TradeSignal): Promise<{ orderId: string }> {
    const mockId = `FOREX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(
      `[FOREX MOCK] ${signal.side} ${signal.symbol} @ ${signal.entryPrice} (confidence: ${signal.confidence.toFixed(2)})`
    );
    return { orderId: mockId };
  }

  private calcRSI(closes: number[], period = 14): number {
    const deltas = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = deltas.map((d) => (d > 0 ? d : 0));
    const losses = deltas.map((d) => (d < 0 ? -d : 0));
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    const rs = avgGain / (avgLoss || 0.0001);
    return 100 - (100 / (1 + rs));
  }

  private calcMACD(closes: number[]): number {
    const ema12 = this.calcEMA(closes, 12);
    const ema26 = this.calcEMA(closes, 26);
    const macdLine = ema12 - ema26;
    const signal = this.calcEMA([macdLine], 9);
    return macdLine - signal;
  }

  private calcEMA(values: number[], period: number): number {
    const multiplier = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < Math.min(period * 2, values.length); i++) {
      ema = values[i] * multiplier + ema * (1 - multiplier);
    }
    return ema;
  }
}
