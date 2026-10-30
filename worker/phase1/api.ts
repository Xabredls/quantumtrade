import type http from 'node:http';
import type { Phase1Engine } from './engine.ts';
import type { BotId } from './types.ts';

const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readJson = (req: http.IncomingMessage) => new Promise<any>((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2000) reject(new Error('body too large')); });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid JSON')); } });
});
const isBot = (b: unknown): b is BotId => b === 'futures' || b === 'spot' || b === 'forex';

/** Caller must already have checked the bearer token. */
export async function handlePhase1(req: http.IncomingMessage, res: http.ServerResponse, engine: Phase1Engine, store: { recentSignals: Function; recentClosed: Function }) {
  const url = new URL(req.url || '/', 'http://x');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const botParam = url.searchParams.get('bot');
  const bot = isBot(botParam) ? botParam : undefined;
  try {
    if (url.pathname === '/phase1/status' && req.method === 'GET') return send(res, 200, { ok: true, ...engine.status() });
    if (url.pathname === '/phase1/signals' && req.method === 'GET') return send(res, 200, { ok: true, signals: store.recentSignals(limit, bot) });
    if (url.pathname === '/phase1/positions' && req.method === 'GET') {
      const page = url.searchParams.get('status') === 'open' ? 'open' : 'closed';
      return send(res, 200, { ok: true, positions: store.recentClosed({ bot, limit, page }) });
    }
    if (url.pathname === '/phase1/scan' && req.method === 'POST') {
      if (engine.running) return send(res, 409, { ok: false, message: 'กำลังสแกนอยู่แล้ว' });
      void engine.runCycle().catch((e) => console.error('[phase1] manual scan error:', (e as Error).message)); // respond immediately; scan takes a while
      return send(res, 202, { ok: true, started: true });
    }
    if (url.pathname === '/phase1/reset-breaker' && req.method === 'POST') {
      const body = await readJson(req);
      if (!isBot(body.bot)) return send(res, 400, { ok: false, message: 'bot ต้องเป็น futures | spot | forex' });
      engine.resetBreaker(body.bot);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { ok: false, message: 'not found' });
  } catch (e) {
    return send(res, 500, { ok: false, message: (e as Error).message });
  }
}
