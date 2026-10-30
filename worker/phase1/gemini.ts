import type { AiAnalyzer, AiVerdict, Candidate } from './types.ts';
import { keyOf } from './types.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class GeminiAnalyzer implements AiAnalyzer {
  constructor(private opts: { apiKey: string; model: string; baseUrl?: string; timeoutMs?: number }) {}
  get model() { return this.opts.model; }

  private prompt(cands: Candidate[]): string {
    const rows = cands.map((c) => ({
      key: keyOf(c),
      market: c.bot === 'spot' ? 'crypto spot (long only)' : c.bot === 'futures' ? 'crypto perpetual futures' : 'forex/gold (synthetic mock data)',
      proposed: c.side,
      techScore: Number(c.techScore.toFixed(2)),
      price: c.price,
      ema20: Number(c.emaFast.toPrecision(6)),
      ema50: Number(c.emaSlow.toPrecision(6)),
      rsi14: Number(c.rsi.toFixed(1)),
      macdHist: Number(c.macdHist.toPrecision(4)),
      atrPct: Number(((c.atr / c.price) * 100).toFixed(2)),
      vol24hUsd: c.quoteVolume === null ? null : Math.round(c.quoteVolume),
      why: c.reasons.join('; '),
    }));
    return [
      'You review candidate trades produced by a rule-based technical scanner (EMA20/50, RSI14, MACD) for a PAPER-TRADING experiment.',
      'For each item decide whether to take the proposed side. Use ONLY the numbers given — do not invent news or prices.',
      'Trade plan: stop = 1.5 x ATR, target = 2.25 x ATR, held up to 24h.',
      'Rules: decision must be the proposed side or SKIP. confidence is your estimated probability (0-1) that the target is hit before the stop.',
      'Be conservative and well calibrated: most setups are near 0.5. Use SKIP for overextended RSI, weak or conflicting momentum, or very high ATR%.',
      'Return a JSON array with exactly one object per item, using the same key.',
      JSON.stringify(rows),
    ].join('\n');
  }

  async analyze(cands: Candidate[]): Promise<Map<string, AiVerdict>> {
    const out = new Map<string, AiVerdict>();
    if (cands.length === 0) return out;
    const base = this.opts.baseUrl ?? 'https://generativelanguage.googleapis.com';
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: this.prompt(cands) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              key: { type: 'STRING' },
              decision: { type: 'STRING', enum: ['BUY', 'SELL', 'SKIP'] },
              confidence: { type: 'NUMBER' },
              rationale: { type: 'STRING' },
            },
            required: ['key', 'decision', 'confidence', 'rationale'],
          },
        },
      },
    });

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(this.opts.model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
          body,
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 45_000),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`Gemini HTTP ${res.status}`);
        if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data: any = await res.json();
        const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('Gemini ตอบกลับไม่ใช่ JSON array');
        const proposed = new Map(cands.map((c) => [keyOf(c), c.side]));
        for (const r of parsed) {
          const key = String(r?.key ?? '');
          const side = proposed.get(key);
          if (!side || out.has(key)) continue; // unknown or duplicate keys are ignored
          const conf = Number(r.confidence);
          const decision = r.decision === side ? side : 'SKIP';
          out.set(key, { key, decision, confidence: Number.isFinite(conf) ? clamp01(conf) : 0, rationale: String(r.rationale ?? '').slice(0, 300) });
        }
        return out;
      } catch (e) {
        lastErr = e as Error;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastErr ?? new Error('Gemini failed');
  }
}
