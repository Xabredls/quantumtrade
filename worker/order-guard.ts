import fs from 'node:fs';
import path from 'node:path';

export class GuardError extends Error { constructor(message: string, public status = 429) { super(message); } }

/**
 * Protects the order endpoint: one order at a time, no accidental repeats (double click / client retry),
 * and an append-only audit log of every attempt (dry-run included).
 */
export class OrderGuard {
  private busy = false;
  private last = new Map<string, number>();
  constructor(private opts: { cooldownMs: number; auditFile?: string; now?: () => number }) {}
  private now() { return (this.opts.now ?? Date.now)(); }

  audit(entry: Record<string, unknown>) {
    if (!this.opts.auditFile) return;
    try {
      fs.mkdirSync(path.dirname(this.opts.auditFile), { recursive: true });
      fs.appendFileSync(this.opts.auditFile, JSON.stringify({ ts: new Date(this.now()).toISOString(), ...entry }) + '\n');
    } catch { /* never let logging break trading */ }
  }

  /** `enforceCooldown` is false in dry-run so testing is not annoying. */
  async run<T>(key: string, info: Record<string, unknown>, enforceCooldown: boolean, fn: () => Promise<T>): Promise<T> {
    if (this.busy) { this.audit({ stage: 'rejected', reason: 'busy', ...info }); throw new GuardError('กำลังประมวลผลออเดอร์อื่นอยู่ ลองใหม่ภายหลัง'); }
    const prev = this.last.get(key);
    if (enforceCooldown && prev !== undefined && this.now() - prev < this.opts.cooldownMs) {
      this.audit({ stage: 'rejected', reason: 'duplicate', ...info });
      throw new GuardError(`ออเดอร์ ${key} เพิ่งถูกส่งไปเมื่อ ${Math.round((this.now() - prev) / 1000)} วินาทีก่อน (กันส่งซ้ำ รอ ${Math.round(this.opts.cooldownMs / 1000)} วินาที)`);
    }
    this.busy = true;
    this.last.set(key, this.now());
    this.audit({ stage: 'attempt', ...info });
    try {
      const result = await fn();
      this.audit({ stage: 'result', ok: true, ...info, result });
      return result;
    } catch (e) {
      this.audit({ stage: 'result', ok: false, ...info, error: (e as Error).message, unprotected: (e as any).name === 'UnprotectedPositionError' || undefined });
      throw e;
    } finally { this.busy = false; }
  }
}
