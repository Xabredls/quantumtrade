import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { BinanceFutures, GeoBlockedError, type BinanceEnv } from './binance.ts';
import { startPhase1, handlePhase1, type Phase1Handle } from './phase1/main.ts';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const env = (process.env.BINANCE_ENV || 'testnet') as BinanceEnv;
const token = process.env.WORKER_TOKEN || '';
const host = process.env.WORKER_HOST || '127.0.0.1'; // set to the Tailscale IP
const port = Number(process.env.WORKER_PORT || 4000);
const dryRun = process.env.DRY_RUN !== 'false'; // default: do NOT send orders
const maxNotional = Number(process.env.MAX_NOTIONAL_USD || 50);
const allowed = (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT').split(',').map((s) => s.trim().toUpperCase());

if (token.length < 24) throw new Error('WORKER_TOKEN ต้องยาวอย่างน้อย 24 ตัวอักษร');
if (env === 'live' && process.env.ALLOW_LIVE !== 'true') throw new Error('BINANCE_ENV=live ต้องตั้ง ALLOW_LIVE=true อย่างตั้งใจ');

const client = new BinanceFutures(env, process.env.BINANCE_API_KEY || '', process.env.BINANCE_API_SECRET || '');

const authorized = (req: http.IncomingMessage) => {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
};
const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readJson = (req: http.IncomingMessage) => new Promise<any>((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 10_000) reject(new Error('body too large')); });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid JSON')); } });
});

// Phase 1 multi-bot scanner (paper trading). Off unless PHASE1_ENABLED=true; a failure here never stops the worker.
let phase1: Phase1Handle | null = null;
startPhase1(process.env).then((h) => { phase1 = h; }).catch((e) => console.error('[phase1] เริ่มไม่ได้:', (e as Error).message));

http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return send(res, 200, { ok: true, env, dryRun });
    if (!authorized(req)) return send(res, 401, { ok: false, message: 'unauthorized' });
    if (req.url?.startsWith('/phase1/')) {
      if (!phase1) return send(res, 503, { ok: false, message: 'Phase 1 ปิดอยู่หรือยังเริ่มไม่สำเร็จ (ตั้ง PHASE1_ENABLED=true ใน worker/.env แล้วดู log)' });
      return handlePhase1(req, res, phase1);
    }

    if (req.url === '/test' && req.method === 'GET') {
      const t0 = Date.now();
      await client.serverTime();
      const balance = await client.usdtBalance();
      return send(res, 200, { ok: true, message: `เชื่อมต่อ Binance Futures (${env}) สำเร็จ${dryRun ? ' — DRY_RUN เปิดอยู่' : ''}`, balance, latencyMs: Date.now() - t0 });
    }

    if (req.url === '/order' && req.method === 'POST') {
      const { symbol, side, quantity, stopPrice } = await readJson(req);
      const sym = String(symbol || '').toUpperCase();
      if (!allowed.includes(sym)) return send(res, 400, { ok: false, message: `symbol ไม่อยู่ใน allowlist (${allowed.join(',')})` });
      if (side !== 'BUY' && side !== 'SELL') return send(res, 400, { ok: false, message: 'side ต้องเป็น BUY หรือ SELL' });
      const qty = Number(quantity), stop = Number(stopPrice);
      if (!(qty > 0) || !(stop > 0)) return send(res, 400, { ok: false, message: 'ต้องระบุ quantity และ stopPrice ที่ถูกต้อง (ไม่อนุญาตให้เปิดโดยไม่มี stop)' });
      const price = await client.markPrice(sym);
      if ((side === 'BUY' && stop >= price) || (side === 'SELL' && stop <= price)) return send(res, 400, { ok: false, message: 'stopPrice อยู่ผิดฝั่งของราคาปัจจุบัน' });
      if (qty * price > maxNotional) return send(res, 400, { ok: false, message: `มูลค่าออเดอร์เกินเพดาน ${maxNotional} USD` });
      if (dryRun) return send(res, 200, { ok: true, dryRun: true, message: 'DRY_RUN: ยังไม่ส่งออเดอร์จริง', plan: { sym, side, qty, stop, price } });
      return send(res, 200, { ok: true, result: await client.openWithStop(sym, side, qty, stop) });
    }
    send(res, 404, { ok: false, message: 'not found' });
  } catch (e) {
    const code = e instanceof GeoBlockedError ? 451 : 500;
    send(res, code, { ok: false, message: (e as Error).message });
  }
}).listen(port, host, () => console.log(`worker (${env}, dryRun=${dryRun}) listening on ${host}:${port}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { void (phase1 ? phase1.stop() : Promise.resolve()).finally(() => process.exit(0)); });
}
