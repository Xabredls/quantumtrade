import React, { useState } from 'react';
import { Header } from './components/Header';
import { BotStatusView } from './components/BotStatusView';
import { BacktestView } from './components/BacktestView';
import { ConnectionCard } from './components/ConnectionCard';

export type Tab = 'phase1' | 'backtest';

// Only real screens live here: the Phase 1 scanner (real Binance data, paper trading) and the real-data Backtest.
// The old in-browser trading simulator (random prices, fake positions/news/AI results) was removed.
export default function App() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [tab, setTab] = useState<Tab>('phase1');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header tab={tab} setTab={setTab} lang={lang} setLang={setLang} />
      <main className="mx-auto w-full max-w-6xl pb-10">
        {tab === 'phase1' && (
          <>
            <ConnectionCard lang={lang} />
            <BotStatusView lang={lang} />
          </>
        )}
        {tab === 'backtest' && <BacktestView lang={lang} />}
      </main>
    </div>
  );
}
