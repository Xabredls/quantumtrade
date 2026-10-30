// Connects Phase 1 to the existing files. Safe to re-run. If ANY anchor is missing, nothing is written.
// Run from anywhere:  node scripts/apply-phase1.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const read = (f) => fs.readFileSync(f, 'utf8');
const problems = [];
const pending = new Map();

function edit(file, label, fn) {
  try {
    const before = pending.get(file) ?? read(file);
    const after = fn(before);
    if (after !== before) pending.set(file, after);
  } catch (e) { problems.push(`${file}: ${label}: ${e.message}`); }
}
function replaceOnce(src, anchor, replacement, what) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${what} — พบ anchor ${n} ที่ (ต้องเป็น 1)`);
  return src.replace(anchor, () => replacement);
}
const nl = (s) => s.replace(/\r\n/g, '\n');

// 1) worker/index.ts
const W = 'worker/index.ts';
if (!read(W).includes('phase1/main.ts')) {
  edit(W, 'import', (s) => replaceOnce(nl(s), "from './binance.ts';", "from './binance.ts';\nimport { startPhase1, handlePhase1, type Phase1Handle } from './phase1/main.ts';", 'import line'));
  edit(W, 'start', (s) => replaceOnce(s, 'http.createServer(async (req, res) => {',
`// Phase 1 multi-bot scanner (paper trading). Off unless PHASE1_ENABLED=true; a failure here never stops the worker.
let phase1: Phase1Handle | null = null;
startPhase1(process.env).then((h) => { phase1 = h; }).catch((e) => console.error('[phase1] เริ่มไม่ได้:', (e as Error).message));

http.createServer(async (req, res) => {`, 'createServer'));
  edit(W, 'route', (s) => replaceOnce(s, "if (!authorized(req)) return send(res, 401, { ok: false, message: 'unauthorized' });",
`if (!authorized(req)) return send(res, 401, { ok: false, message: 'unauthorized' });
    if (req.url?.startsWith('/phase1/')) {
      if (!phase1) return send(res, 503, { ok: false, message: 'Phase 1 ปิดอยู่หรือยังเริ่มไม่สำเร็จ (ตั้ง PHASE1_ENABLED=true ใน worker/.env แล้วดู log)' });
      return handlePhase1(req, res, phase1);
    }`, 'auth line'));
  edit(W, 'shutdown', (s) => s.replace(/\s*$/, '\n') + `
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { void (phase1 ? phase1.stop() : Promise.resolve()).finally(() => process.exit(0)); });
}
`);
}

// 2) server.ts (dashboard proxy)
const S = 'server.ts';
if (!read(S).includes('/api/phase1/')) {
  edit(S, 'proxy', (s) => replaceOnce(nl(s), '// Setup Vite or Static Server',
`// ---- Phase 1 scanner status (proxied to the worker) ----
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
app.post('/api/phase1/scan', forward('POST'));
app.post('/api/phase1/reset-breaker', forward('POST'));

// Setup Vite or Static Server`, 'Vite marker'));
}

// 3) dashboard tab
const H = 'src/components/Header.tsx', A = 'src/App.tsx';
if (!read(A).includes('phase1_bots')) {
  edit(H, 'tab type', (s) => {
    const n = s.split("| 'tailscale_mobile'").length - 1;
    if (n !== 2) throw new Error(`union type พบ ${n} ที่ (ต้องเป็น 2)`);
    return s.split("| 'tailscale_mobile'").join("| 'tailscale_mobile' | 'phase1_bots'");
  });
  edit(H, 'desktop button', (s) => replaceOnce(nl(s), "<span>{lang === 'th' ? 'Tailscale' : 'Tailscale'}</span>\n          </button>",
`<span>{lang === 'th' ? 'Tailscale' : 'Tailscale'}</span>
          </button>

          <button
            onClick={() => setActiveTab('phase1_bots')}
            className={\`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors \${
              activeTab === 'phase1_bots' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
            }\`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Phase 1</span>
          </button>`, 'desktop nav'));
  edit(H, 'mobile button', (s) => replaceOnce(s, "{lang === 'th' ? '📱มือถือ' : '📱Mobile'}\n        </button>",
`{lang === 'th' ? '📱มือถือ' : '📱Mobile'}
        </button>
        <button
          onClick={() => setActiveTab('phase1_bots')}
          className={\`px-2 py-1 rounded whitespace-nowrap \${activeTab === 'phase1_bots' ? 'text-emerald-400 font-bold' : 'text-slate-400'}\`}
        >
          Phase 1
        </button>`, 'mobile nav'));
  edit(A, 'tab type', (s) => {
    const n = s.split("| 'tailscale_mobile'").length - 1;
    if (n !== 1) throw new Error(`union type พบ ${n} ที่ (ต้องเป็น 1)`);
    return s.replace("| 'tailscale_mobile'", "| 'tailscale_mobile' | 'phase1_bots'");
  });
  edit(A, 'import', (s) => replaceOnce(s, "import { TailscaleMobileView } from './components/TailscaleMobileView';", "import { TailscaleMobileView } from './components/TailscaleMobileView';\nimport { BotStatusView } from './components/BotStatusView';", 'import'));
  edit(A, 'render', (s) => replaceOnce(nl(s), "        {activeTab === 'tailscale_mobile' && (", "        {activeTab === 'phase1_bots' && (\n          <BotStatusView lang={lang} />\n        )}\n\n        {activeTab === 'tailscale_mobile' && (", 'render block'));
}

// 4) env example + gitignore (text appends)
const E = 'worker/.env.example';
if (!read(E).includes('PHASE1_ENABLED')) edit(E, 'env', (s) => s.replace(/\s*$/, '\n') + `
# ---- Phase 1 multi-bot scanner (paper trading only) ----
# Off unless true.
PHASE1_ENABLED=true
# Optional. Without it the scanner still logs signals but opens NO paper trades (fail closed).
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
# Market data source: live = real Binance public data (no key needed), testnet = testnet data.
DATA_SOURCE=live
# Everything below is optional (defaults shown).
# SCAN_INTERVAL_MS=300000
# KLINE_INTERVAL=15m
# VOLUME_FILTER_USD=5000000
# MIN_TECH_SCORE=0.65
# MIN_AI_CONFIDENCE=0.6
# MAX_ORDERS_PER_SYMBOL=3
`);
edit('.gitignore', 'ignore', (s) => (s.includes('worker/phase1/data') ? s : s.replace(/\s*$/, '\n') + '*.zip\nworker/phase1/data/\n'));

if (problems.length) {
  console.error('\n❌ ไม่ได้แก้ไฟล์ใดเลย เพราะพบปัญหา:\n  - ' + problems.join('\n  - '));
  console.error('\nไฟล์ของคุณอาจต่างจากที่ผมเห็น — ส่งข้อความนี้กลับมาให้ผมดูครับ');
  process.exit(1);
}
if (pending.size === 0) { console.log('✅ ติดตั้งไว้ครบแล้ว ไม่มีอะไรต้องแก้'); process.exit(0); }
for (const [f, content] of pending) fs.writeFileSync(f, content);
console.log('✅ แก้ไขแล้ว:\n  - ' + [...pending.keys()].join('\n  - '));
