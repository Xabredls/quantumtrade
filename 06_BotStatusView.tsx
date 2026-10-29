'use client';

import { useEffect, useState } from 'react';

interface BotStatus {
  futures: string;
  spot: string;
  forex: string;
}

interface WorkerStats {
  ok?: boolean;
  phase?: number;
  status?: string;
  dryRun?: boolean;
  bots?: BotStatus;
  totalOrders?: number;
  lastScan?: number;
}

export function BotStatusView() {
  const [stats, setStats] = useState<WorkerStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/worker/health');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = (await res.json()) as WorkerStats;
        setStats(data);
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading bot status...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-400">Error: {error}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-4">Phase 1: Multi-Bot Status</h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Futures Bot */}
          <div className="bg-gray-800 rounded p-4 border border-blue-500">
            <div className="text-sm font-semibold text-blue-400 mb-2">📊 Binance Futures</div>
            <div className="text-xs text-gray-300">{stats.bots?.futures || 'Connecting...'}</div>
          </div>

          {/* Spot Bot */}
          <div className="bg-gray-800 rounded p-4 border border-green-500">
            <div className="text-sm font-semibold text-green-400 mb-2">💰 Binance Spot</div>
            <div className="text-xs text-gray-300">{stats.bots?.spot || 'Connecting...'}</div>
          </div>

          {/* Forex Bot */}
          <div className="bg-gray-800 rounded p-4 border border-yellow-500">
            <div className="text-sm font-semibold text-yellow-400 mb-2">💵 Forex + Gold</div>
            <div className="text-xs text-gray-300">{stats.bots?.forex || 'Mock (no auth)'}</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded p-4 border border-gray-700 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status:</span>
            <span className={`font-semibold ${stats.status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {stats.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Mode:</span>
            <span className={`font-semibold ${stats.dryRun ? 'text-yellow-400' : 'text-red-400'}`}>
              {stats.dryRun ? '🟡 DRY_RUN (Testing)' : '🔴 LIVE (Real Orders)'}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total Orders:</span>
            <span className="text-blue-400 font-semibold">{stats.totalOrders || 0}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Last Scan:</span>
            <span className="text-gray-300">
              {stats.lastScan ? new Date(stats.lastScan).toLocaleTimeString() : 'Never'}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-900 rounded border border-blue-700 text-xs text-blue-200">
          <div className="font-semibold mb-1">Phase 1 Architecture</div>
          <div className="space-y-1 text-xs text-blue-300">
            <div>✓ 3 Bots scanning in parallel</div>
            <div>✓ Gemini AI for signal confirmation</div>
            <div>✓ SQLite learning database</div>
            <div>✓ Confidence-based position sizing</div>
            <div>✓ Technical indicators: MA + RSI + MACD</div>
          </div>
        </div>
      </div>
    </div>
  );
}
