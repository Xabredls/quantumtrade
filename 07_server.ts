import express, { type Express } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.use(express.json());
app.use(express.static('public'));

// CORS for worker access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const WORKER_URL = process.env.WORKER_URL || 'http://100.85.216.9:4000';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';

// Proxy to worker health
app.get('/api/worker/health', async (req, res) => {
  try {
    const response = await fetch(`${WORKER_URL}/health`, {
      headers: {
        'Authorization': `Bearer ${WORKER_TOKEN}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Worker unreachable' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Worker connection failed',
      message: String(error),
    });
  }
});

// Proxy to worker stats
app.get('/api/worker/stats', async (req, res) => {
  try {
    const response = await fetch(`${WORKER_URL}/stats`, {
      headers: {
        'Authorization': `Bearer ${WORKER_TOKEN}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Worker unreachable' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Worker connection failed',
      message: String(error),
    });
  }
});

// Trigger manual scan
app.post('/api/worker/scan', async (req, res) => {
  try {
    const response = await fetch(`${WORKER_URL}/scan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WORKER_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Scan failed' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Scan request failed',
      message: String(error),
    });
  }
});

// Health check for systemd
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  console.log('Dashboard client connected');

  const interval = setInterval(async () => {
    try {
      const response = await fetch(`${WORKER_URL}/health`, {
        headers: {
          'Authorization': `Bearer ${WORKER_TOKEN}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        ws.send(JSON.stringify({ type: 'bot_status', data }));
      }
    } catch (e) {
      console.error('WebSocket update error:', e);
    }
  }, 5000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Dashboard client disconnected');
  });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Dashboard running on ${HOST}:${PORT}`);
  console.log(`   Worker URL: ${WORKER_URL}`);
  console.log(`   WS: ws://${HOST}:${PORT}`);
});
