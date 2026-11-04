import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { buildPrompt, hardChecks, parseTradeRequest, ruleOnlyDecision, sanitizeAi } from './guard/ai-guard.ts';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Optional login for the WHOLE dashboard (HTTP Basic). Off unless DASHBOARD_PASSWORD is set. Over plain HTTP the password is
// readable on the wire, so keep using it only through Tailscale (encrypted) or put HTTPS in front.
const dashPassword = process.env.DASHBOARD_PASSWORD || '';
const dashUser = process.env.DASHBOARD_USER || 'admin';
if (dashPassword) {
  if (dashPassword.length < 8) { console.error('DASHBOARD_PASSWORD ต้องยาวอย่างน้อย 8 ตัวอักษร'); process.exit(1); }
  const same = (a: string, b: string) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
  const failures = new Map<string, number[]>();
  setInterval(() => { const now = Date.now(); for (const [k, v] of failures) if (!v.length || now - v[v.length - 1] > 60_000) failures.delete(k); }, 60_000).unref();
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next(); // uptime checks only; returns nothing sensitive
    const ip = req.ip || 'unknown', now = Date.now();
    const recent = (failures.get(ip) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 10) return res.status(429).send('ลองรหัสผ่านผิดหลายครั้งเกินไป รอ 1 นาที');
    const m = /^Basic (.+)$/.exec(String(req.headers.authorization || ''));
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      if (i >= 0 && same(decoded.slice(0, i), dashUser) && same(decoded.slice(i + 1), dashPassword)) return next();
      recent.push(now); failures.set(ip, recent);
    }
    res.set('WWW-Authenticate', 'Basic realm="QuantumTrade", charset="UTF-8"').status(401).send('ต้องเข้าสู่ระบบ');
  });
} else {
  console.warn('⚠️ ไม่ได้ตั้ง DASHBOARD_PASSWORD — ทุกคนที่เข้าถึงแดชบอร์ดได้ (เช่นผ่าน Tailscale) ใช้งานและกดปุ่มสแกน/รีเซ็ตได้ ตั้งรหัสผ่านเพื่อเปิดระบบล็อกอิน');
}

app.use(express.json({ limit: '100kb' }));

// Simple in-memory rate limit for /api (60 req/min per IP)
const hits = new Map<string, number[]>();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) return res.status(429).json({ error: 'too many requests' });
  recent.push(now);
  hits.set(key, recent);
  next();
});

// forget idle IPs so the map cannot grow forever
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60_000) hits.delete(k); }, 60_000).unref();

// Initialize Gemini Client
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Endpoint: AI trade audit. Hard rules are enforced HERE (see guard/ai-guard.ts); the AI can only make the decision stricter.
app.post('/api/ai-analyze-trade', async (req, res) => {
  const parsed = parseTradeRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ approved: false, reason: `ข้อมูลไม่ถูกต้อง: ${parsed.reason}` });
  const v = parsed.v;
  const checks = hardChecks(v);
  const safetyChecks = { regimeSafe: !v.regime.includes('NEWS'), rrRatioOk: checks.rrOk, newsSafe: checks.newsOk, slSideOk: checks.slSideOk, tpSideOk: checks.tpSideOk };

  if (!ai) {
    const d = ruleOnlyDecision(v, checks);
    return res.json({
      approved: d.approved,
      confidenceScore: d.score, // share of rule checks passed — NOT a probability of profit
      modelUsed: 'Rule check only (ไม่มี AI)',
      reason: d.reason,
      safetyChecks,
      dynamicAdjustments: { suggestedSl: v.proposedSl, suggestedTp: v.proposedTp, trailingLockActivationR: 1.5 },
    });
  }

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(v),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            regimeAssessment: { type: Type.STRING },
            suggestedSl: { type: Type.NUMBER },
            suggestedTp: { type: Type.NUMBER },
            deltaNeutralHedgingAdvice: { type: Type.STRING },
          },
          required: ['approved', 'confidenceScore', 'reason'],
        },
      },
    });
    const raw = JSON.parse(response.text?.trim() || '{}');
    const out = sanitizeAi(raw, v, checks);
    return res.json({
      approved: out.approved,
      confidenceScore: out.confidenceScore, // the model's own estimate, not a calibrated probability
      modelUsed: `Google Gemini (${model}) + rule check`,
      reason: out.reason,
      safetyChecks,
      dynamicAdjustments: { suggestedSl: out.suggestedSl, suggestedTp: out.suggestedTp, trailingLockActivationR: 1.5 },
      deltaNeutralAdvice: typeof raw.deltaNeutralHedgingAdvice === 'string' ? raw.deltaNeutralHedgingAdvice.slice(0, 400) : undefined,
    });
  } catch (err: any) {
    console.error('Gemini Trade Analysis Error:', err?.message ?? err);
    res.status(500).json({ approved: false, reason: 'AI Server Fallback: ไม่อนุมัติออเดอร์เพื่อความปลอดภัยสูงสุดของพอร์ต' }); // no internal error text to the client
  }
});

// ---- Exchange access goes through the worker (runs where Binance is reachable) ----
const WORKER_URL = process.env.WORKER_URL; // e.g. http://100.x.y.z:4000 over Tailscale
const WORKER_TOKEN = process.env.WORKER_TOKEN;
async function callWorker(p: string, init: RequestInit = {}) {
  if (!WORKER_URL || !WORKER_TOKEN) throw new Error('ยังไม่ได้ตั้งค่า WORKER_URL / WORKER_TOKEN');
  const r = await fetch(`${WORKER_URL}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/exchange/test', async (_req, res) => {
  try { const { status, body } = await callWorker('/test'); res.status(status).json(body); }
  catch (e: any) { res.status(502).json({ ok: false, message: e.message }); }
});
// The dashboard UI never places orders through this route, so it is OFF unless you deliberately turn it on AND set a key.
const orderProxyKey = process.env.ORDER_PROXY_KEY || '';
app.post('/api/exchange/order', async (req, res) => {
  if (process.env.ENABLE_ORDER_PROXY !== 'true') return res.status(503).json({ ok: false, message: 'endpoint นี้ปิดอยู่ (หน้าเว็บไม่ได้ใช้) — ถ้าจำเป็นต้องตั้ง ENABLE_ORDER_PROXY=true และ ORDER_PROXY_KEY' });
  if (orderProxyKey.length < 16) return res.status(503).json({ ok: false, message: 'ORDER_PROXY_KEY ต้องยาวอย่างน้อย 16 ตัวอักษร' });
  const given = Buffer.from(String(req.headers['x-order-key'] || '')), want = Buffer.from(orderProxyKey);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ ok: false, message: 'unauthorized' });
  try { const { status, body } = await callWorker('/order', { method: 'POST', body: JSON.stringify(req.body) }); res.status(status).json(body); }
  catch (e: any) { res.status(502).json({ ok: false, message: e.message }); }
});

// ---- Phase 1 scanner status (proxied to the worker) ----
const forward = (method: 'GET' | 'POST') => async (req: express.Request, res: express.Response) => {
  try {
    const { status, body } = await callWorker(req.originalUrl.replace('/api/phase1', '/phase1'), {
      method, body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });
    res.status(status).json(body);
  } catch (e: any) { res.status(502).json({ ok: false, message: e.message }); }
};
app.get('/api/phase1/status', forward('GET'));
app.get('/api/phase1/signals', forward('GET'));
app.get('/api/phase1/positions', forward('GET'));
app.get('/api/phase1/backtest/list', forward('GET'));
app.get('/api/phase1/backtest/latest', forward('GET'));
app.get('/api/phase1/backtest/data', forward('GET'));
app.post('/api/phase1/scan', forward('POST'));
app.post('/api/phase1/reset-breaker', forward('POST'));

// Unknown /api routes answer JSON (not the web page); bad JSON bodies answer 400 instead of a stack trace.
app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'not found' }));
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  const bad = err?.type === 'entity.parse.failed' || err?.status === 400;
  res.status(bad ? 400 : 500).json({ ok: false, message: bad ? 'JSON ไม่ถูกต้อง' : 'internal error' });
});

// Setup Vite or Static Server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  const host = process.env.HOST || '127.0.0.1'; // set to the Tailscale IP to reach it from your phone
  app.listen(Number(port), host, () => {
    console.log(`🚀 QuantumTrade AI Full-Stack Server running on port ${port}`);
  });
}

startServer();
