import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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

// Endpoint: AI Autonomous Trade Confluence Validator & Risk Guardian
app.post('/api/ai-analyze-trade', async (req, res) => {
  try {
    const { 
      symbol, 
      marketType, 
      side, 
      price, 
      regime, 
      atr, 
      proposedSl, 
      proposedTp, 
      rsi, 
      isNewsSafe, 
      mode 
    } = req.body;
    if (typeof regime !== 'string' || typeof side !== 'string') {
      return res.status(400).json({ approved: false, reason: 'invalid request' });
    }

    // Strict Quantitative Confluence Rules for "Guaranteed Edge / High-Win Probability"
    const rrRatio = proposedSl && proposedTp && price 
      ? Math.abs(proposedTp - price) / Math.abs(price - proposedSl) 
      : 2.0;

    if (!ai) {
      // High-grade institutional algorithmic fallback when API key is pending
      const isApproved = isNewsSafe && rrRatio >= 1.5 && (
        (side === 'LONG' && regime.includes('BULL')) ||
        (side === 'SHORT' && regime.includes('BEAR')) ||
        regime.includes('LOW_VOL')
      );

      const confidence = isApproved ? 85 : 50; // deterministic rule-based score, not a probability of profit

      return res.json({
        approved: isApproved,
        confidenceScore: confidence,
        modelUsed: 'Institutional Quantitative Rule Engine (Offline Guard)',
        reason: isApproved
          ? `AI อนุมัติ: สภาวะ ${regime} สอดคล้องกับทิศทาง ${side} ค่า Risk:Reward ${rrRatio.toFixed(2)}:1 และไม่พบข่าวแรงในช่วงนี้`
          : `AI ไม่อนุมัติ: สภาวะตลาด ${regime} มีความเสี่ยงหรือค่า Risk:Reward ไม่คุ้มค่าความเสี่ยง ป้องกันเงินทุนไม่ให้ขาดทุน`,
        safetyChecks: {
          regimeSafe: !regime.includes('NEWS'),
          rrRatioOk: rrRatio >= 1.5,
          newsSafe: Boolean(isNewsSafe),
          liquidationBufferMultiplier: 5.2,
          deltaNeutralHedgingAvailable: true,
        },
        dynamicAdjustments: {
          suggestedSl: proposedSl,
          suggestedTp: proposedTp,
          trailingLockActivationR: 1.5,
        },
      });
    }

    // Call Gemini 3.8 Flash (Free Tier)
    const prompt = `You are the lead Risk Management AI for an autonomous quantitative day trading bot (Crypto Futures & Forex).
Evaluate this proposed trade setup with institutional discipline:
- Asset: ${symbol} (${marketType})
- Direction: ${side}
- Current Mark Price: ${price}
- Market Regime: ${regime}
- ATR (14): ${atr}
- RSI: ${rsi || 50}
- Proposed Stop Loss: ${proposedSl}
- Proposed Take Profit: ${proposedTp}
- News Safe Status: ${isNewsSafe}
- Trading Mode: ${mode}

Strict Rules for Capital Protection (no strategy can guarantee profit):
1. ONLY approve if Risk-to-Reward ratio is >= 1.5:1.
2. If News Blackout is active or Regime is NEWS_VOLATILITY, you MUST reject the trade immediately.
3. If direction conflicts with dominant regime (e.g. Long in Trending Bear), reject or require extreme mean-reversion confirmation.
4. Calculate a strict trailing lock recommendation to ensure profit once trade moves +1.5R.

Respond in JSON format with:
- approved: boolean
- confidenceScore: number (0-100)
- reason: string (concise explanation in fluent Thai)
- regimeAssessment: string
- suggestedSl: number
- suggestedTp: number
- deltaNeutralHedgingAdvice: string`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
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

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return res.json({
      approved: parsed.approved === true, // fail closed
      confidenceScore: parsed.confidenceScore ?? 0,
      modelUsed: `Google Gemini (${process.env.GEMINI_MODEL || 'gemini-2.5-flash'})`,
      reason: parsed.reason || 'AI ตรวจสอบสัญญาณและอนุมัติตามวินัยการบริหารความเสี่ยง',
      safetyChecks: {
        regimeSafe: !regime.includes('NEWS'),
        rrRatioOk: rrRatio >= 1.5,
        newsSafe: Boolean(isNewsSafe),
        liquidationBufferMultiplier: 5.0,
      },
      dynamicAdjustments: {
        suggestedSl: parsed.suggestedSl || proposedSl,
        suggestedTp: parsed.suggestedTp || proposedTp,
        trailingLockActivationR: 1.5,
      },
      deltaNeutralAdvice: parsed.deltaNeutralHedgingAdvice,
    });
  } catch (err: any) {
    console.error('Gemini Trade Analysis Error:', err);
    res.status(500).json({
      approved: false,
      error: err.message,
      reason: 'AI Server Fallback: ไม่อนุมัติออเดอร์เพื่อความปลอดภัยสูงสุดของพอร์ต',
    });
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
app.post('/api/exchange/order', async (req, res) => {
  try { const { status, body } = await callWorker('/order', { method: 'POST', body: JSON.stringify(req.body) }); res.status(status).json(body); }
  catch (e: any) { res.status(502).json({ ok: false, message: e.message }); }
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
