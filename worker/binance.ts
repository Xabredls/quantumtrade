import crypto from 'node:crypto';

export type BinanceEnv = 'testnet' | 'live';
const BASES: Record<BinanceEnv, string> = {
  testnet: 'https://testnet.binancefuture.com',
  live: 'https://fapi.binance.com',
};

/** Thrown when Binance refuses the request because of the server's location (HTTP 451). */
export class GeoBlockedError extends Error {}

export class BinanceFutures {
  constructor(private env: BinanceEnv, private key: string, private secret: string) {}

  private async request(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number> = {}, signed = false) {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    if (signed) {
      q.set('timestamp', String(Date.now()));
      q.set('recvWindow', '5000');
      q.set('signature', crypto.createHmac('sha256', this.secret).update(q.toString()).digest('hex'));
    }
    const res = await fetch(`${BASES[this.env]}${path}?${q}`, {
      method,
      headers: this.key ? { 'X-MBX-APIKEY': this.key } : {},
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (res.status === 451 || /restricted location/i.test(text)) {
      throw new GeoBlockedError('Binance ปฏิเสธเพราะตำแหน่งของเครื่องที่รันบอทอยู่ในพื้นที่จำกัด (HTTP 451) — ให้รัน worker ในที่ที่ใช้งานได้ตามเงื่อนไขของ Binance');
    }
    if (!res.ok) throw new Error(`Binance ${res.status}: ${text}`);
    return JSON.parse(text);
  }

  serverTime() { return this.request('GET', '/fapi/v1/time'); }
  async markPrice(symbol: string): Promise<number> {
    const d = await this.request('GET', '/fapi/v1/premiumIndex', { symbol });
    return parseFloat(d.markPrice);
  }
  async usdtBalance(): Promise<string> {
    const rows = await this.request('GET', '/fapi/v2/balance', {}, true);
    const usdt = rows.find((r: any) => r.asset === 'USDT');
    return usdt ? `${usdt.availableBalance} USDT (available)` : 'no USDT balance';
  }

  /** Market entry, then a protective stop. If the stop cannot be placed, the position is closed immediately. */
  async openWithStop(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number) {
    const exit = side === 'BUY' ? 'SELL' : 'BUY';
    const entry = await this.request('POST', '/fapi/v1/order', {
      symbol, side, type: 'MARKET', quantity, newOrderRespType: 'RESULT',
    }, true);
    try {
      // Conditional orders (STOP_MARKET) must use the Algo Order endpoint since Dec 2025.
      const stop = await this.request('POST', '/fapi/v1/algoOrder', {
        algoType: 'CONDITIONAL', symbol, side: exit, type: 'STOP_MARKET',
        triggerPrice: stopPrice, closePosition: 'true', workingType: 'MARK_PRICE',
      }, true);
      return { entry, stop };
    } catch (err) {
      await this.request('POST', '/fapi/v1/order', {
        symbol, side: exit, type: 'MARKET', quantity, reduceOnly: 'true',
      }, true).catch(() => undefined);
      throw new Error(`วาง stop-loss ไม่สำเร็จ จึงปิดตำแหน่งทันที: ${(err as Error).message}`);
    }
  }
}
