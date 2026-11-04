import crypto from 'node:crypto';

export type BinanceEnv = 'testnet' | 'live';
const BASES: Record<BinanceEnv, string> = {
  testnet: 'https://testnet.binancefuture.com',
  live: 'https://fapi.binance.com',
};

/** Thrown when Binance refuses the request because of the server's location (HTTP 451). */
export class GeoBlockedError extends Error {}

/** The request may or may not have reached Binance (timeout / network drop) — the outcome is UNKNOWN. */
export class UncertainRequestError extends Error {}

/** A position may be open WITHOUT a stop-loss. Needs a human right now. */
export class UnprotectedPositionError extends Error {
  constructor(message: string, public detail: Record<string, unknown> = {}) { super(message); this.name = 'UnprotectedPositionError'; }
}

/** A configured risk limit (daily loss, total exposure) blocks the order. Nothing was sent. */
export class RiskLimitError extends Error {}

export interface SymbolRules { tickSize: number; stepSize: number; minQty: number; minNotional: number }

const decimalsOf = (step: number) => { const s = step.toString(); return s.includes('e-') ? Number(s.split('e-')[1]) : (s.split('.')[1]?.length ?? 0); };
/** Floor `x` to a multiple of `step` without floating-point surprises. */
export function floorToStep(x: number, step: number): number {
  if (!(step > 0)) return x;
  return Number((Math.floor(Math.round((x / step) * 1e8) / 1e8) * step).toFixed(decimalsOf(step)));
}
export function ceilToStep(x: number, step: number): number {
  if (!(step > 0)) return x;
  return Number((Math.ceil(Math.round((x / step) * 1e8) / 1e8) * step).toFixed(decimalsOf(step)));
}

export class BinanceFutures {
  private offset = 0;
  private offsetAt = 0;
  private rulesCache: { at: number; map: Map<string, SymbolRules> } | null = null;

  /** `baseUrl` is for tests only (index.ts honours it on testnet only). */
  constructor(private env: BinanceEnv, private key: string, private secret: string, private baseUrl?: string) {}

  private base() { return this.baseUrl ?? BASES[this.env]; }

  private async raw(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number>, signed: boolean) {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    if (signed) {
      await this.ensureOffset();
      q.set('timestamp', String(Date.now() + this.offset));
      q.set('recvWindow', '5000');
      q.set('signature', crypto.createHmac('sha256', this.secret).update(q.toString()).digest('hex'));
    }
    let res: Response;
    try {
      res = await fetch(`${this.base()}${path}?${q}`, { method, headers: this.key ? { 'X-MBX-APIKEY': this.key } : {}, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new UncertainRequestError(`เชื่อมต่อ Binance ไม่สำเร็จหรือหมดเวลา (${(e as Error).message}) — ไม่ทราบว่าคำสั่งถึง Binance หรือไม่`);
    }
    const text = await res.text();
    if (res.status === 451 || /restricted location/i.test(text)) {
      throw new GeoBlockedError('Binance ปฏิเสธเพราะตำแหน่งของเครื่องที่รันบอทอยู่ในพื้นที่จำกัด (HTTP 451) — ให้รัน worker ในที่ที่ใช้งานได้ตามเงื่อนไขของ Binance');
    }
    return { status: res.status, ok: res.ok, text };
  }

  private async request(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number> = {}, signed = false) {
    let r = await this.raw(method, path, params, signed);
    if (signed && !r.ok && /"code":\s*-1021/.test(r.text)) { // our clock drifted: re-sync with Binance and retry once
      await this.syncTime();
      r = await this.raw(method, path, params, signed);
    }
    if (!r.ok) {
      let code: number | undefined;
      try { code = JSON.parse(r.text).code; } catch { /* not JSON */ }
      const err = new Error(`Binance ${r.status}: ${r.text}`) as Error & { binanceCode?: number; httpStatus?: number };
      err.binanceCode = code; err.httpStatus = r.status;
      throw err;
    }
    return JSON.parse(r.text);
  }

  /** Windows clocks drift; a signed request more than 5 s off is rejected (-1021). Measure the offset once in a while. */
  private async syncTime() {
    const t0 = Date.now();
    const r = await this.raw('GET', '/fapi/v1/time', {}, false);
    if (!r.ok) return;
    const server = JSON.parse(r.text).serverTime as number;
    this.offset = server - Math.round((t0 + Date.now()) / 2);
    this.offsetAt = Date.now();
  }
  private async ensureOffset() { if (Date.now() - this.offsetAt > 10 * 60_000) await this.syncTime().catch(() => undefined); }

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

  async rules(symbol: string): Promise<SymbolRules> {
    if (!this.rulesCache || Date.now() - this.rulesCache.at > 3600_000) {
      const info = await this.request('GET', '/fapi/v1/exchangeInfo');
      const map = new Map<string, SymbolRules>();
      for (const s of info.symbols as any[]) {
        const f = (t: string) => (s.filters as any[]).find((x) => x.filterType === t) ?? {};
        const lot = f('MARKET_LOT_SIZE').stepSize ? f('MARKET_LOT_SIZE') : f('LOT_SIZE');
        map.set(s.symbol, { tickSize: Number(f('PRICE_FILTER').tickSize), stepSize: Number(lot.stepSize), minQty: Number(lot.minQty), minNotional: Number(f('MIN_NOTIONAL').notional ?? 0) });
      }
      this.rulesCache = { at: Date.now(), map };
    }
    const r = this.rulesCache.map.get(symbol);
    if (!r) throw new Error(`ไม่พบกฎการซื้อขายของ ${symbol} ใน Binance`);
    return r;
  }

  /** Round to the exchange's step/tick sizes and refuse anything the exchange would reject — BEFORE any order is placed. */
  async prepare(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number, refPrice: number) {
    const r = await this.rules(symbol);
    const qty = floorToStep(quantity, r.stepSize);
    // stop is rounded AWAY from the market so rounding can never put it on the wrong side
    const stop = side === 'BUY' ? floorToStep(stopPrice, r.tickSize) : ceilToStep(stopPrice, r.tickSize);
    if (!(qty >= r.minQty && qty > 0)) throw new Error(`quantity ${quantity} น้อยกว่าขั้นต่ำของ ${symbol} (ขั้นต่ำ ${r.minQty}, step ${r.stepSize})`);
    if (qty * refPrice < r.minNotional) throw new Error(`มูลค่าออเดอร์ต่ำกว่าขั้นต่ำของ Binance (${r.minNotional} USD)`);
    if (!(stop > 0) || (side === 'BUY' && stop >= refPrice) || (side === 'SELL' && stop <= refPrice)) throw new Error('stopPrice อยู่ผิดฝั่งของราคาปัจจุบันหลังปัดตาม tick size');
    return { qty, stop, rules: r };
  }

  private hedgeCache: { at: number; on: boolean } | null = null;
  /** Hedge ("dual side") accounts need positionSide on every order and do not accept reduceOnly. */
  async isHedgeMode(): Promise<boolean> {
    if (this.hedgeCache && Date.now() - this.hedgeCache.at < 60_000) return this.hedgeCache.on;
    const r = await this.request('GET', '/fapi/v1/positionSide/dual', {}, true);
    const on = r.dualSidePosition === true || r.dualSidePosition === 'true';
    this.hedgeCache = { at: Date.now(), on };
    return on;
  }

  /** Absolute open quantity of a symbol; in hedge mode only the given side (the other side may be a deliberate position). */
  async openPositionAmount(symbol: string, positionSide?: 'LONG' | 'SHORT'): Promise<number> {
    const rows = (await this.request('GET', '/fapi/v2/positionRisk', { symbol }, true)) as any[];
    return rows.filter((r) => !positionSide || r.positionSide === positionSide).reduce((a, r) => a + Math.abs(parseFloat(r.positionAmt)), 0);
  }

  async setLeverage(symbol: string, leverage: number) { await this.request('POST', '/fapi/v1/leverage', { symbol, leverage }, true); }
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED') {
    try { await this.request('POST', '/fapi/v1/marginType', { symbol, marginType }, true); }
    catch (e) { if ((e as any).binanceCode === -4046) return; throw e; } // -4046 = already that margin type
  }
  /** Notional value of everything currently open, all symbols. */
  async totalNotionalUsd(): Promise<number> {
    const rows = (await this.request('GET', '/fapi/v2/positionRisk', {}, true)) as any[];
    return rows.reduce((a, r) => a + Math.abs(parseFloat(r.positionAmt)) * parseFloat(r.markPrice ?? '0'), 0);
  }
  /** Today's (UTC) realized PnL + commissions + funding. Transfers and other income types are ignored. */
  async dailyPnlUsd(now = Date.now()): Promise<number> {
    const start = Math.floor(now / 86_400_000) * 86_400_000;
    const rows = (await this.request('GET', '/fapi/v1/income', { startTime: start, limit: 1000 }, true)) as any[];
    return rows.filter((r) => ['REALIZED_PNL', 'COMMISSION', 'FUNDING_FEE'].includes(r.incomeType)).reduce((a, r) => a + parseFloat(r.income), 0);
  }
  /** Checks that cost nothing (limits first), then applies margin type / leverage. Throws before any order is sent. */
  async preflight(symbol: string, newNotionalUsd: number, o: { leverage?: number; marginType?: 'ISOLATED' | 'CROSSED'; maxTotalNotionalUsd?: number; maxDailyLossUsd?: number }) {
    if (o.maxDailyLossUsd !== undefined) {
      const pnl = await this.dailyPnlUsd();
      if (pnl <= -o.maxDailyLossUsd) throw new RiskLimitError(`ถึงเพดานขาดทุนรายวันแล้ว (วันนี้ ${pnl.toFixed(2)} USD, เพดาน -${o.maxDailyLossUsd}) — งดออเดอร์ใหม่จนถึงวันถัดไป (UTC)`);
    }
    if (o.maxTotalNotionalUsd !== undefined) {
      const cur = await this.totalNotionalUsd();
      if (cur + newNotionalUsd > o.maxTotalNotionalUsd) throw new RiskLimitError(`มูลค่าตำแหน่งรวมจะเกินเพดาน (ตอนนี้ ${cur.toFixed(2)} + ใหม่ ${newNotionalUsd.toFixed(2)} > ${o.maxTotalNotionalUsd} USD)`);
    }
    if (o.marginType) await this.setMarginType(symbol, o.marginType);
    if (o.leverage) await this.setLeverage(symbol, o.leverage);
  }

  private newClientId() { return `qt${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`; }

  /** After an uncertain failure, find out what really happened to an order with this client id. */
  private async lookup(symbol: string, clientId: string): Promise<any | null> {
    try { return await this.request('GET', '/fapi/v1/order', { symbol, origClientOrderId: clientId }, true); }
    catch (e) { if ((e as any).binanceCode === -2013) return null; throw e; } // -2013 = order does not exist
  }

  /**
   * Market entry, then a protective stop.
   * - Quantity/stop are validated and rounded to exchange rules BEFORE the entry (otherwise a stop rejected for a bad tick
   *   size would open and immediately close the position, paying fees for nothing).
   * - If the entry result is uncertain (timeout) the order is looked up by client id instead of being assumed failed.
   * - If the stop cannot be placed the position is closed and the close is VERIFIED. If it cannot be verified an
   *   UnprotectedPositionError is thrown — never a message that claims the position is closed when it may not be.
   */
  async openWithStop(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number) {
    const exit = side === 'BUY' ? 'SELL' : 'BUY';
    const ref = await this.markPrice(symbol);
    const { qty, stop } = await this.prepare(symbol, side, quantity, stopPrice, ref);
    const hedge = await this.isHedgeMode();
    const ps = hedge ? (side === 'BUY' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT' : undefined;
    const psParam: Record<string, string> = ps ? { positionSide: ps } : {};
    const clientId = this.newClientId();

    let entry: any;
    try {
      entry = await this.request('POST', '/fapi/v1/order', { symbol, side, type: 'MARKET', quantity: qty, newOrderRespType: 'RESULT', newClientOrderId: clientId, ...psParam }, true);
    } catch (e) {
      if (!(e instanceof UncertainRequestError)) throw e; // Binance answered with a rejection: nothing was opened
      let found: any | null;
      try { found = await this.lookup(symbol, clientId); }
      catch { throw new UnprotectedPositionError('ส่งคำสั่งเข้าแล้วไม่ทราบผล และตรวจสถานะไม่ได้ — เช็กตำแหน่งใน Binance ทันที', { symbol, clientId }); }
      if (!found) throw new Error('คำสั่งเข้าไม่ถึง Binance (ยืนยันแล้วว่าไม่มีออเดอร์) — ไม่มีตำแหน่งเปิด');
      entry = found;
    }
    const filled = parseFloat(entry.executedQty ?? '0');
    if (!(filled > 0)) throw new Error(`ออเดอร์เข้าไม่ถูกเติม (status ${entry.status ?? '?'}) — ไม่มีตำแหน่งเปิด`);

    try {
      // Conditional orders (STOP_MARKET) must use the Algo Order endpoint since Dec 2025.
      const stopOrder = await this.request('POST', '/fapi/v1/algoOrder', {
        algoType: 'CONDITIONAL', symbol, side: exit, type: 'STOP_MARKET', triggerPrice: stop, closePosition: 'true', workingType: 'MARK_PRICE', ...psParam,
      }, true);
      return { entry, stop: stopOrder, applied: { quantity: qty, stopPrice: stop } };
    } catch (err) {
      const why = (err as Error).message;
      let closeError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await this.request('POST', '/fapi/v1/order', { symbol, side: exit, type: 'MARKET', quantity: filled, ...(ps ? { positionSide: ps } : { reduceOnly: 'true' }) }, true); break; } // hedge mode has no reduceOnly
        catch (e) { closeError = (e as Error).message; }
      }
      let remaining: number | null = null;
      try { remaining = await this.openPositionAmount(symbol, ps); } catch { /* unknown */ }
      if (remaining === 0) throw new Error(`วาง stop-loss ไม่สำเร็จ จึงปิดตำแหน่งแล้ว (ยืนยันจาก positionRisk): ${why}`);
      throw new UnprotectedPositionError(
        `ตำแหน่ง ${symbol} อาจยังเปิดอยู่และไม่มี stop-loss! วาง stop ไม่สำเร็จ (${why}) และปิดตำแหน่ง${remaining === null ? 'ยืนยันไม่ได้' : `ไม่สำเร็จ (เหลือ ${remaining})`}${closeError ? ` (${closeError})` : ''} — ปิดด้วยมือที่ Binance ทันที`,
        { symbol, side, filled, remaining },
      );
    }
  }
}
