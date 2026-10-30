import type { BotId, Candle, MarketProvider, SymbolList } from './types.ts';

/**
 * SYNTHETIC data — not a real market. It only exists so the Forex/Gold bot can exercise the full
 * pipeline until a real feed (OANDA) is connected. One candle = one scan interval.
 */
interface Spec { symbol: string; start: number; volPct: number }
const SPECS: Spec[] = [
  { symbol: 'EURUSD', start: 1.08, volPct: 0.0006 },
  { symbol: 'GBPUSD', start: 1.27, volPct: 0.0008 },
  { symbol: 'XAUUSD', start: 2650, volPct: 0.0012 },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface State { spec: Spec; candles: Candle[]; drift: number; left: number; rand: () => number }

export class ForexMock implements MarketProvider {
  readonly bot: BotId = 'forex';
  private states = new Map<string, State>();

  constructor(private candleMs: number, seed = 42, now = Date.now()) {
    SPECS.forEach((spec, idx) => {
      const st: State = { spec, candles: [], drift: 0, left: 0, rand: mulberry32(seed + idx * 1000) };
      const first = now - 160 * candleMs;
      let price = spec.start;
      for (let i = 0; i < 160; i++) {
        const c = this.step(st, price, first + i * candleMs);
        st.candles.push(c);
        price = c.close;
      }
      this.states.set(spec.symbol, st);
    });
  }

  private step(st: State, price: number, openTime: number): Candle {
    if (st.left <= 0) { // new regime every 25-60 candles: up, down or sideways
      const r = st.rand();
      st.drift = (r < 0.4 ? 1 : r < 0.8 ? -1 : 0) * st.spec.volPct * 0.35;
      st.left = 25 + Math.floor(st.rand() * 35);
    }
    st.left--;
    const move = () => st.drift + (st.rand() - 0.5) * 2 * st.spec.volPct;
    const open = price;
    const close = open * (1 + move());
    const high = Math.max(open, close) * (1 + st.rand() * st.spec.volPct * 0.5);
    const low = Math.min(open, close) * (1 - st.rand() * st.spec.volPct * 0.5);
    return { openTime, open, high, low, close, volume: 1000 + st.rand() * 500, closeTime: openTime + this.candleMs - 1 };
  }

  /** Advance every pair by one candle (called once per scan cycle). */
  tick(now = Date.now()): void {
    for (const st of this.states.values()) {
      const last = st.candles[st.candles.length - 1];
      const c = this.step(st, last.close, Math.max(last.closeTime + 1, now - this.candleMs));
      st.candles.push(c);
      if (st.candles.length > 400) st.candles.shift();
    }
  }

  async listSymbols(): Promise<SymbolList> {
    return { universe: SPECS.length, symbols: SPECS.map((s) => ({ symbol: s.symbol, quoteVolume: null })) };
  }

  async candles(symbol: string, _interval: string, limit: number): Promise<Candle[]> {
    const st = this.states.get(symbol);
    if (!st) throw new Error(`forex mock: unknown symbol ${symbol}`);
    return st.candles.slice(-limit);
  }
}
