import { confirmedSignal } from './indicators.ts';
import { RateLimitError } from './binance-market.ts';
import type { Phase1Config } from './config.ts';
import type { Store, PositionRow } from './store.ts';
import type { AiAnalyzer, AiVerdict, BotId, Candidate, Candle, MarketProvider, Side } from './types.ts';
import { keyOf } from './types.ts';

export interface BotCycle {
  universe: number; passedVolume: number; scanned: number; candidates: number; opened: number; closed: number; error: string | null;
}
export interface CycleSummary { ts: number; durationMs: number; perBot: Partial<Record<BotId, BotCycle>>; ai: { called: boolean; error: string | null; candidates: number } }

export interface EngineDeps {
  cfg: Phase1Config;
  store: Store;
  providers: Partial<Record<BotId, MarketProvider & { tick?: () => void }>>;
  ai: AiAnalyzer | null;
  now?: () => number;
  log?: (msg: string) => void;
}

export function sizeForConfidence(conf: number, maxNotional: number): number {
  const usd = conf >= 0.9 ? 30 : conf >= 0.8 ? 25 : conf >= 0.7 ? 20 : 15;
  return Math.min(usd, maxNotional);
}

export function pnlUsd(side: Side, entry: number, exit: number, sizeUsd: number, feePct: number): number {
  const qty = sizeUsd / entry;
  const gross = (side === 'BUY' ? exit - entry : entry - exit) * qty;
  const fees = (sizeUsd + qty * exit) * (feePct / 100);
  return gross - fees;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, shouldStop: () => boolean): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length && !shouldStop()) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export class Phase1Engine {
  private timer: NodeJS.Timeout | null = null;
  private cycleRunning = false;
  private stopped = false;
  private now: () => number;
  private log: (msg: string) => void;
  private aiCallTimes: number[] = [];
  last: CycleSummary | null = null;
  nextScanAt: number | null = null;
  aiLastError: string | null = null;
  aiLastOkAt: number | null = null;

  constructor(private d: EngineDeps) {
    this.now = d.now ?? Date.now;
    this.log = d.log ?? ((m) => console.log(m));
  }

  get bots(): BotId[] { return this.d.cfg.bots.filter((b) => this.d.providers[b]); }
  get running() { return this.cycleRunning; }

  /** Forex mock data is regenerated on restart, so its old open paper positions can't be evaluated honestly. */
  init() {
    const n = this.d.store.voidOpen('forex', this.now());
    if (n > 0) this.log(`[phase1] ปิด ${n} ตำแหน่ง forex mock ที่ค้างจากรอบก่อน (outcome=void ไม่นับสถิติ)`);
  }

  start() {
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      try { await this.runCycle(); } catch (e) { this.log(`[phase1] cycle error: ${(e as Error).message}`); }
      if (this.stopped) return;
      this.nextScanAt = this.now() + this.d.cfg.scanIntervalMs;
      this.timer = setTimeout(loop, this.d.cfg.scanIntervalMs);
    };
    void loop();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (let i = 0; i < 100 && this.cycleRunning; i++) await new Promise((r) => setTimeout(r, 100));
    this.d.store.close();
  }

  // ---- circuit breaker -------------------------------------------------------------------
  private resetAt(bot: BotId) { return Number(this.d.store.getKv(`breaker_reset_${bot}`) ?? 0); }
  breakerTripped(bot: BotId): boolean {
    return this.d.store.consecutiveLosses(bot, this.resetAt(bot), this.d.cfg.breakerLosses) >= this.d.cfg.breakerLosses;
  }
  resetBreaker(bot: BotId) { this.d.store.setKv(`breaker_reset_${bot}`, String(this.now())); }

  // ---- paper-position resolution ---------------------------------------------------------
  private async resolveOpen(bot: BotId): Promise<number> {
    const { store, cfg } = this.d;
    const open = store.openPositions(bot);
    if (open.length === 0) return 0;
    const provider = this.d.providers[bot]!;
    const bySymbol = new Map<string, PositionRow[]>();
    for (const p of open) bySymbol.set(p.symbol, [...(bySymbol.get(p.symbol) ?? []), p]);
    let closed = 0;
    const now = this.now();
    for (const [symbol, positions] of bySymbol) {
      let candles: Candle[];
      try { candles = (await provider.candles(symbol, cfg.klineInterval, 100)).filter((c) => c.closeTime <= now); }
      catch (e) { if (e instanceof RateLimitError) throw e; continue; }
      if (candles.length === 0) continue;
      for (const p of positions) {
        let exit: { price: number; outcome: 'tp' | 'sl' | 'timeout'; at: number } | null = null;
        for (const c of candles) {
          if (c.openTime < p.opened_at) continue;
          const hitSl = p.side === 'BUY' ? c.low <= p.sl : c.high >= p.sl;
          const hitTp = p.side === 'BUY' ? c.high >= p.tp : c.low <= p.tp;
          if (hitSl) { exit = { price: p.sl, outcome: 'sl', at: c.closeTime }; break; } // both in one candle => assume stop first
          if (hitTp) { exit = { price: p.tp, outcome: 'tp', at: c.closeTime }; break; }
        }
        if (!exit && now - p.opened_at >= cfg.maxHoldHours * 3600_000) {
          const last = candles[candles.length - 1];
          exit = { price: last.close, outcome: 'timeout', at: now };
        }
        if (exit) {
          store.closePosition(p.id, exit.at, exit.price, pnlUsd(p.side, p.entry, exit.price, p.size_usd, cfg.feePct[bot]), exit.outcome);
          closed++;
        }
      }
    }
    return closed;
  }

  // ---- scanning ---------------------------------------------------------------------------
  private async scanBot(bot: BotId, b: BotCycle, out: Candidate[]): Promise<void> {
    const { cfg } = this.d;
    const provider = this.d.providers[bot]!;
    provider.tick?.();
    const list = await provider.listSymbols();
    b.universe = list.universe;
    b.passedVolume = list.symbols.length;
    const state: { abort: Error | null } = { abort: null };
    await mapPool(list.symbols, cfg.concurrency, async (s) => {
      try {
        const candles = await provider.candles(s.symbol, cfg.klineInterval, 100);
        b.scanned++;
        const sig = confirmedSignal(candles, { confirm: cfg.confirmCandles, minScore: cfg.minTechScore, now: this.now() });
        if (sig) out.push({ bot, symbol: s.symbol, side: sig.side, techScore: sig.score, price: sig.price, atr: sig.atr, rsi: sig.rsi, macdHist: sig.macdHist, emaFast: sig.emaFast, emaSlow: sig.emaSlow, quoteVolume: s.quoteVolume, reasons: sig.reasons });
      } catch (e) {
        if (e instanceof RateLimitError) state.abort = e; // stop hammering; remaining symbols are skipped this round
      }
    }, () => state.abort !== null);
    if (state.abort) b.error = state.abort.message;
  }

  private gate(c: Candidate): string | null {
    const { cfg, store } = this.d;
    if (c.bot === 'spot' && c.side === 'SELL') return 'spot_long_only';
    if (this.breakerTripped(c.bot)) return 'circuit_breaker';
    if (!(c.atr > 0)) return 'bad_atr';
    if (store.openPositions(c.bot).length >= cfg.maxOpenPerBot) return 'max_open_bot';
    const same = store.openPositions(c.bot, c.symbol);
    if (same.length >= cfg.maxOrdersPerSymbol) return 'max_per_symbol';
    if (same.some((p) => p.side !== c.side)) return 'opposite_open';
    const lastOpened = same.reduce((m, p) => Math.max(m, p.opened_at), 0);
    if (lastOpened && this.now() - lastOpened < cfg.entryCooldownMin * 60_000) return 'cooldown';
    return null;
  }

  async runCycle(): Promise<CycleSummary> {
    if (this.cycleRunning) throw new Error('cycle already running');
    this.cycleRunning = true;
    const t0 = this.now();
    const { cfg, store } = this.d;
    try {
      const perBot: Partial<Record<BotId, BotCycle>> = {};
      const cands: Candidate[] = [];
      await Promise.all(this.bots.map(async (bot) => {
        const b: BotCycle = { universe: 0, passedVolume: 0, scanned: 0, candidates: 0, opened: 0, closed: 0, error: null };
        perBot[bot] = b;
        try {
          b.closed = await this.resolveOpen(bot);
          const found: Candidate[] = [];
          await this.scanBot(bot, b, found);
          b.candidates = found.length;
          cands.push(...found);
        } catch (e) { b.error = (e as Error).message; }
      }));

      // One batched AI call for everything found this cycle (best technical scores first).
      cands.sort((a, b) => b.techScore - a.techScore);
      const sent = cands.slice(0, cfg.aiMaxCandidates);
      let verdicts = new Map<string, AiVerdict>();
      const ai = { called: false, error: null as string | null, candidates: sent.length };
      if (this.d.ai && sent.length > 0) {
        ai.called = true;
        this.aiCallTimes = [...this.aiCallTimes.filter((t) => t > t0 - 3600_000), t0];
        try { verdicts = await this.d.ai.analyze(sent); this.aiLastError = null; this.aiLastOkAt = this.now(); }
        catch (e) { ai.error = (e as Error).message; this.aiLastError = ai.error; }
      } else if (!this.d.ai) ai.error = 'ไม่ได้ตั้ง GEMINI_API_KEY';
      const sentKeys = new Set(sent.map(keyOf));

      for (const c of cands) {
        const key = keyOf(c);
        const v = verdicts.get(key);
        let reason: string | null = null;
        if (!this.d.ai || ai.error) reason = 'ai_unavailable'; // fail closed: no AI answer => no trade
        else if (!sentKeys.has(key)) reason = 'ai_cap';
        else if (!v) reason = 'ai_no_verdict';
        else if (v.decision === 'SKIP') reason = 'ai_skip';
        else if (v.decision !== c.side) reason = 'ai_disagrees';
        else if (v.confidence < cfg.minAiConfidence) reason = 'low_confidence';
        else reason = this.gate(c);
        const open = reason === null && v !== undefined;
        const signalId = store.logSignal({
          ts: this.now(), bot: c.bot, symbol: c.symbol, side: c.side, tech_score: c.techScore, price: c.price, atr: c.atr, rsi: c.rsi,
          macd_hist: c.macdHist, quote_volume: c.quoteVolume, reasons: c.reasons.join('; '), ai_decision: v?.decision ?? null,
          ai_confidence: v?.confidence ?? null, ai_rationale: v?.rationale ?? null, action: open ? 'OPEN' : 'SKIP', skip_reason: reason,
        });
        if (open && v) {
          const dist = (m: number) => c.atr * m;
          const sl = c.side === 'BUY' ? c.price - dist(cfg.slAtrMult) : c.price + dist(cfg.slAtrMult);
          const tp = c.side === 'BUY' ? c.price + dist(cfg.tpAtrMult) : c.price - dist(cfg.tpAtrMult);
          if (sl > 0 && tp > 0) {
            store.openPosition({ openedAt: this.now(), bot: c.bot, symbol: c.symbol, side: c.side, entry: c.price, sl, tp, sizeUsd: sizeForConfidence(v.confidence, cfg.maxNotionalUsd), confidence: v.confidence, techScore: c.techScore, signalId });
            perBot[c.bot]!.opened++;
          }
        }
      }

      for (const bot of this.bots) {
        const b = perBot[bot]!;
        store.logCycle({ ts: t0, bot, universe: b.universe, passedVolume: b.passedVolume, scanned: b.scanned, candidates: b.candidates, opened: b.opened, closed: b.closed, error: b.error });
        this.log(`[phase1] ${bot}: universe=${b.universe} vol_ok=${b.passedVolume} scanned=${b.scanned} signals=${b.candidates} opened=${b.opened} closed=${b.closed}${b.error ? ` ERR=${b.error}` : ''}`);
      }
      if (ai.error) this.log(`[phase1] AI: ${ai.error}`);
      this.last = { ts: t0, durationMs: this.now() - t0, perBot, ai };
      return this.last;
    } finally {
      this.cycleRunning = false;
    }
  }

  status() {
    const { cfg, store } = this.d;
    const bots: Record<string, unknown> = {};
    for (const bot of this.bots) {
      bots[bot] = { ...store.stats(bot), breakerTripped: this.breakerTripped(bot), lastCycle: this.last?.perBot[bot] ?? null };
    }
    return {
      enabled: true, dryRun: true, running: this.cycleRunning, scanIntervalSec: cfg.scanIntervalMs / 1000, klineInterval: cfg.klineInterval,
      dataSource: cfg.dataSource, volumeFilterUsd: cfg.volumeFilterUsd, nextScanAt: this.nextScanAt, lastScanAt: this.last?.ts ?? null,
      lastDurationMs: this.last?.durationMs ?? null,
      ai: { configured: this.d.ai !== null, model: this.d.ai?.model ?? null, lastError: this.aiLastError, lastOkAt: this.aiLastOkAt, callsLastHour: this.aiCallTimes.filter((t) => t > this.now() - 3600_000).length },
      bots,
    };
  }
}
