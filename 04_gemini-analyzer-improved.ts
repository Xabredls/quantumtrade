interface GeminiRequest {
  contents: Array<{ parts: Array<{ text: string }> }>;
}

interface GeminiResponse {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
}

export interface SignalForAnalysis {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  technicalConfidence: number;
  reason: string;
}

export interface AIDecision {
  symbol: string;
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  rationale: string;
  positionSize: number;
}

export class GeminiAnalyzer {
  private callCount = 0;
  private lastResetTime = Date.now();
  private maxCallsPerHour = 50;

  constructor(private apiKey: string) {}

  async analyzeSignalsBatch(signals: SignalForAnalysis[]): Promise<AIDecision[]> {
    if (signals.length === 0) return [];

    // Rate limiting check
    if (this.shouldRateLimit()) {
      console.warn('⚠️  Gemini rate limit approaching, using fallback');
      return this.fallbackAnalysis(signals);
    }

    const prompt = `You are a crypto/forex trading AI. Analyze these signals and rate decision confidence (0-1).
CRITICAL: Return ONLY valid JSON array, no markdown, no extra text.

Signals:
${signals.map((s) => `${s.symbol}: ${s.signal} (tech confidence: ${s.technicalConfidence.toFixed(2)}, reason: ${s.reason})`).join('\n')}

For each symbol, return: {
  "symbol": "X",
  "decision": "BUY|SELL|HOLD",
  "confidence": 0.0-1.0,
  "rationale": "brief reason"
}

Return as JSON array only:`;

    try {
      const body: GeminiRequest = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + this.apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        console.error(`Gemini API error: ${res.status}`);
        return this.fallbackAnalysis(signals);
      }

      this.callCount++;

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON found in response, using fallback');
        return this.fallbackAnalysis(signals);
      }

      const decisions = JSON.parse(jsonMatch[0]) as Array<{
        symbol: string;
        decision: 'BUY' | 'SELL' | 'HOLD';
        confidence: number;
        rationale: string;
      }>;

      // Convert to AIDecision with position sizing
      return decisions.map((d) => ({
        symbol: d.symbol,
        decision: d.decision,
        confidence: Math.max(0, Math.min(1, d.confidence)),
        rationale: d.rationale,
        positionSize: this.calculatePositionSize(d.confidence),
      }));
    } catch (e) {
      console.error('Gemini analysis error:', e);
      return this.fallbackAnalysis(signals);
    }
  }

  private fallbackAnalysis(signals: SignalForAnalysis[]): AIDecision[] {
    return signals.map((s) => {
      const confidence = s.signal === 'HOLD' ? 0.3 : s.technicalConfidence;
      return {
        symbol: s.symbol,
        decision: confidence > 0.6 ? s.signal : 'HOLD',
        confidence,
        rationale: `Fallback: ${s.reason}`,
        positionSize: this.calculatePositionSize(confidence),
      };
    });
  }

  private calculatePositionSize(confidence: number): number {
    if (confidence < 0.6) return 0;
    if (confidence < 0.7) return 15;
    if (confidence < 0.8) return 20;
    return 25;
  }

  private shouldRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastResetTime > 3600000) {
      // Reset hourly
      this.callCount = 0;
      this.lastResetTime = now;
    }
    return this.callCount >= this.maxCallsPerHour;
  }

  getStats(): { callsThisHour: number; remainingQuota: number } {
    return {
      callsThisHour: this.callCount,
      remainingQuota: Math.max(0, this.maxCallsPerHour - this.callCount),
    };
  }
}
