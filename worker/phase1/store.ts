import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { BotId, Side } from './types.ts';

export interface PositionRow {
  id: number; opened_at: number; bot: BotId; symbol: string; side: Side; entry: number; sl: number; tp: number;
  size_usd: number; confidence: number; tech_score: number; status: 'open' | 'closed'; closed_at: number | null;
  exit_price: number | null; pnl_usd: number | null; outcome: string | null; signal_id: number | null; shadow: number;
}
export interface SignalRow {
  id: number; ts: number; bot: BotId; symbol: string; side: Side; tech_score: number; price: number; atr: number; rsi: number;
  macd_hist: number; quote_volume: number | null; reasons: string; ai_decision: string | null; ai_confidence: number | null;
  ai_rationale: string | null; action: string; skip_reason: string | null;
}
export interface BotStats { closed: number; wins: number; losses: number; winRate: number | null; pnlUsd: number; open: number; expectancyR: number | null }
/** real = positions the AI approved; shadow = same-rule positions for signals the AI REJECTED (to measure whether the AI helps) */
export type Kind = 'real' | 'shadow' | 'all';
const kindSql = (k: Kind) => (k === 'real' ? ' AND shadow=0' : k === 'shadow' ? ' AND shadow=1' : '');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cycles (id INTEGER PRIMARY KEY, ts INTEGER, bot TEXT, universe INTEGER, passed_volume INTEGER, scanned INTEGER,
  candidates INTEGER, opened INTEGER, closed INTEGER, error TEXT);
CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY, ts INTEGER, bot TEXT, symbol TEXT, side TEXT, tech_score REAL, price REAL, atr REAL,
  rsi REAL, macd_hist REAL, quote_volume REAL, reasons TEXT, ai_decision TEXT, ai_confidence REAL, ai_rationale TEXT, action TEXT, skip_reason TEXT);
CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY, opened_at INTEGER, bot TEXT, symbol TEXT, side TEXT, entry REAL, sl REAL, tp REAL,
  size_usd REAL, confidence REAL, tech_score REAL, status TEXT, closed_at INTEGER, exit_price REAL, pnl_usd REAL, outcome TEXT, signal_id INTEGER, shadow INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_pos_open ON positions(status, bot, symbol);
CREATE INDEX IF NOT EXISTS idx_sig_ts ON signals(ts);
`;

export class Store {
  constructor(private db: any) {
    db.exec('PRAGMA journal_mode=WAL;');
    db.exec(SCHEMA);
    // databases created before shadow tracking: add the column (old rows are real positions)
    const cols = db.prepare('PRAGMA table_info(positions)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'shadow')) db.exec('ALTER TABLE positions ADD COLUMN shadow INTEGER NOT NULL DEFAULT 0');
  }

  logCycle(r: { ts: number; bot: BotId; universe: number; passedVolume: number; scanned: number; candidates: number; opened: number; closed: number; error: string | null }) {
    this.db.prepare('INSERT INTO cycles (ts,bot,universe,passed_volume,scanned,candidates,opened,closed,error) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(r.ts, r.bot, r.universe, r.passedVolume, r.scanned, r.candidates, r.opened, r.closed, r.error);
  }

  logSignal(r: Omit<SignalRow, 'id'>): number {
    const res = this.db.prepare(
      'INSERT INTO signals (ts,bot,symbol,side,tech_score,price,atr,rsi,macd_hist,quote_volume,reasons,ai_decision,ai_confidence,ai_rationale,action,skip_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(r.ts, r.bot, r.symbol, r.side, r.tech_score, r.price, r.atr, r.rsi, r.macd_hist, r.quote_volume, r.reasons, r.ai_decision,
      r.ai_confidence, r.ai_rationale, r.action, r.skip_reason);
    return Number(res.lastInsertRowid);
  }

  openPosition(p: { openedAt: number; bot: BotId; symbol: string; side: Side; entry: number; sl: number; tp: number; sizeUsd: number; confidence: number; techScore: number; signalId: number | null; shadow?: boolean }): number {
    const res = this.db.prepare(
      "INSERT INTO positions (opened_at,bot,symbol,side,entry,sl,tp,size_usd,confidence,tech_score,status,signal_id,shadow) VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?)",
    ).run(p.openedAt, p.bot, p.symbol, p.side, p.entry, p.sl, p.tp, p.sizeUsd, p.confidence, p.techScore, p.signalId, p.shadow ? 1 : 0);
    return Number(res.lastInsertRowid);
  }

  openPositions(bot?: BotId, symbol?: string, kind: Kind = 'real'): PositionRow[] {
    const where = ["status='open'" + kindSql(kind)], args: string[] = [];
    if (bot) { where.push('bot=?'); args.push(bot); }
    if (symbol) { where.push('symbol=?'); args.push(symbol); }
    return this.db.prepare(`SELECT * FROM positions WHERE ${where.join(' AND ')} ORDER BY opened_at`).all(...args) as PositionRow[];
  }

  closePosition(id: number, closedAt: number, exitPrice: number, pnlUsd: number, outcome: 'tp' | 'sl' | 'timeout' | 'void') {
    this.db.prepare("UPDATE positions SET status='closed', closed_at=?, exit_price=?, pnl_usd=?, outcome=? WHERE id=? AND status='open'")
      .run(closedAt, exitPrice, pnlUsd, outcome, id);
  }

  voidOpen(bot: BotId, now: number): number {
    const res = this.db.prepare("UPDATE positions SET status='closed', closed_at=?, pnl_usd=0, outcome='void' WHERE status='open' AND bot=?").run(now, bot);
    return Number(res.changes);
  }

  recentClosed(positions: { bot?: BotId; limit: number; page?: 'closed' | 'open'; kind?: Kind }): PositionRow[] {
    const status = positions.page ?? 'closed';
    const order = status === 'closed' ? 'closed_at' : 'opened_at';
    const sql = `SELECT * FROM positions WHERE status=?${kindSql(positions.kind ?? 'real')} ${positions.bot ? 'AND bot=?' : ''} ORDER BY ${order} DESC LIMIT ?`;
    const args: Array<string | number> = [status];
    if (positions.bot) args.push(positions.bot);
    args.push(positions.limit);
    return this.db.prepare(sql).all(...args) as PositionRow[];
  }

  /** Closed (non-void) trades of a bot, newest first — input for the circuit breaker. */
  closedNewestFirst(bot: BotId, limit: number): Array<{ closedAt: number; pnl: number }> {
    const rows = this.db.prepare(
      "SELECT closed_at, pnl_usd FROM positions WHERE status='closed' AND shadow=0 AND bot=? AND outcome!='void' ORDER BY closed_at DESC, id DESC LIMIT ?",
    ).all(bot, limit) as Array<{ closed_at: number; pnl_usd: number }>;
    return rows.map((r) => ({ closedAt: r.closed_at, pnl: r.pnl_usd }));
  }

  /** (legacy) Number of losing trades in a row, newest first, counted only after `sinceTs` (breaker reset). */
  consecutiveLosses(bot: BotId, sinceTs: number, cap: number): number {
    const rows = this.db.prepare(
      "SELECT pnl_usd FROM positions WHERE status='closed' AND shadow=0 AND bot=? AND outcome!='void' AND closed_at>? ORDER BY closed_at DESC, id DESC LIMIT ?",
    ).all(bot, sinceTs, cap) as Array<{ pnl_usd: number }>;
    let n = 0;
    for (const r of rows) { if (r.pnl_usd <= 0) n++; else break; }
    return n;
  }

  stats(bot: BotId, kind: Kind = 'real'): BotStats {
    const k = kindSql(kind);
    const row = this.db.prepare(
      `SELECT COUNT(*) AS closed, SUM(CASE WHEN pnl_usd>0 THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pnl_usd<=0 THEN 1 ELSE 0 END) AS losses,
              COALESCE(SUM(pnl_usd),0) AS pnl, AVG(pnl_usd / (size_usd * ABS(entry - sl) / entry)) AS r
       FROM positions WHERE status='closed' AND outcome!='void' AND bot=?${k}`,
    ).get(bot) as { closed: number; wins: number | null; losses: number | null; pnl: number; r: number | null };
    const open = (this.db.prepare(`SELECT COUNT(*) AS n FROM positions WHERE status='open' AND bot=?${k}`).get(bot) as { n: number }).n;
    const wins = row.wins ?? 0;
    return { closed: row.closed, wins, losses: row.losses ?? 0, winRate: row.closed > 0 ? wins / row.closed : null, pnlUsd: row.pnl, open, expectancyR: row.closed > 0 ? row.r : null };
  }

  recentSignals(limit: number, bot?: BotId): SignalRow[] {
    return this.db.prepare(`SELECT * FROM signals ${bot ? 'WHERE bot=?' : ''} ORDER BY id DESC LIMIT ?`).all(...(bot ? [bot, limit] : [limit])) as SignalRow[];
  }

  getKv(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined;
    return r ? r.value : null;
  }
  setKv(key: string, value: string) {
    this.db.prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  }

  close() { try { this.db.close(); } catch { /* already closed */ } }
}

export async function openStore(dbPath: string): Promise<Store> {
  let sqlite: any;
  try { sqlite = await import('node:sqlite'); }
  catch { throw new Error('ต้องใช้ Node.js 22.5 ขึ้นไป (มี node:sqlite ในตัว) — ตรวจด้วย: node --version'); }
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  return new Store(new sqlite.DatabaseSync(dbPath));
}
