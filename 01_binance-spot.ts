import { ExchangeBase, TradeSignal, ScanResult } from './exchange-base.js';

const BASE = 'https://testnet.binance.vision';

export class BinanceSpot extends ExchangeBase {
  async serverTime(): Promise<number> {
    const res = await fetch(`${BASE}/api/v3/time`);
    const data = (await res.json()) as { serverTime: number };
    return data.serverTime;
  }

  async getBalance(): Promise<string> {
    const timestamp = Date.now();
    const signature = this.signRequest({ timestamp });
    const res = await fetch(`${BASE}/api/v3/account?timestamp=${timestamp}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    const data = (await res.json()) as { balances: Array<{ asset: string; free: string }> };
    const usdt = data.balances.find((b) => b.asset === 'USDT');
    return usdt ? `${usdt.free} USDT` : 'N/A';
  }

  async scan(symbols: string[]): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    for (const sym of symbols) {
      try {
        const klines = await fetch(`${BASE}/api/v3/klines?symbol=${sym}&interval=1h&limit=100`);
        const data = (await klines.json()) as Array<
          [number, string, string, string, string, string, number, string, number, string, string, string]
        >;

        const closes = data.map((k) => parseFloat(k[4]));
        const volumes = data.map((k) => parseFloat(k[7]));

        const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        const rsi = this.calcRSI(closes);
        const macdHist = this.calcMACD(closes);
        const volume24h = volumes.reduce((a, b) => a + b, 0);

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
      } catch (e) {
        console.error(`Spot scan error for ${sym}:`, e);
      }
    }
    return results;
  }

  async placeOrder(signal: TradeSignal): Promise<{ orderId: string }> {
    const qty = 0.001;
    const timestamp = Date.now();
    const params = {
      symbol: signal.symbol,
      side: signal.side,
      type: 'MARKET',
      quantity: qty,
      timestamp,
    };
    const signature = this.signRequest(params);

    const res = await fetch(`${BASE}/api/v3/order`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey },
      body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]) as [string, string][]).toString() + `&signature=${signature}`,
    });

    const data = (await res.json()) as { orderId: string };
    return { orderId: data.orderId };
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
