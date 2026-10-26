import React, { useState, useId } from 'react';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Smartphone, 
  Bell, 
  Settings2,
  ExternalLink
} from 'lucide-react';
import { TelegramSettings } from '../types/trading';
import { sendTelegramAlert } from '../utils/telegramService';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TelegramSettings;
  onUpdateSettings: (s: TelegramSettings) => void;
  lang: 'th' | 'en';
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  lang,
}) => {
  const [botToken, setBotToken] = useState<string>(settings.botToken || '');
  const [chatId, setChatId] = useState<string>(settings.chatId || '');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const botTokenId = useId();
  const chatIdId = useId();

  if (!isOpen) return null;

  const handleTestAlert = async () => {
    setIsSending(true);
    setTestResult(null);

    const res = await sendTelegramAlert(botToken, chatId, {
      title: lang === 'th' ? 'ทดสอบการเชื่อมต่อระบบแจ้งเตือน' : 'Telegram Bot Connection Test',
      type: 'TEST',
      details: {
        'ระบบ': 'QuantumTrade AI Engine',
        'สถานะ': 'เชื่อมต่อสำเร็จ 24/7 พร้อมแจ้งเตือน',
        'เซิร์ฟเวอร์': 'Google Compute Engine (Free Tier)',
        'เวลา': new Date().toLocaleTimeString('th-TH'),
      },
    });

    setIsSending(false);
    if (res.success) {
      setTestResult({
        success: true,
        message: lang === 'th' ? 'ส่งข้อความทดสอบสำเร็จ! ตรวจสอบแชทในมือถือของคุณได้ทันที' : 'Test message sent successfully! Check your Telegram app.',
      });
      onUpdateSettings({
        ...settings,
        botToken,
        chatId,
        enabled: true,
        lastTestStatus: 'SUCCESS',
      });
    } else {
      setTestResult({
        success: false,
        message: res.error || 'Failed to send message',
      });
    }
  };

  const handleSave = () => {
    onUpdateSettings({
      ...settings,
      botToken,
      chatId,
      enabled: Boolean(botToken && chatId),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {lang === 'th' ? 'ตั้งค่าการแจ้งเตือนผ่าน Telegram บนมือถือ' : 'Telegram & Mobile Push Notifications'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'th' ? 'รับการแจ้งเตือนทันทีเมื่อบอทเปิด/ปิดออเดอร์ ชนจุด TP/SL หรือพบข่าวแรง' : 'Real-time alerts directly to your mobile phone when trades trigger.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <span className="sr-only">Close</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* Inputs */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor={botTokenId} className="text-slate-300 font-medium">Telegram Bot Token</label>
                <a 
                  href="https://t.me/BotFather" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-sky-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  <span>{lang === 'th' ? 'สร้างบอทผ่าน @BotFather' : 'Get via @BotFather'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                id={botTokenId}
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor={chatIdId} className="text-slate-300 font-medium">Telegram Chat ID</label>
                <a 
                  href="https://t.me/userinfobot" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-sky-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  <span>{lang === 'th' ? 'หา Chat ID ผ่าน @userinfobot' : 'Get via @userinfobot'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                id={chatIdId}
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="987654321 หรือ -100xxxxxxxxxx สำหรับกลุ่ม"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Test Button & Status */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestAlert}
                disabled={isSending || !botToken || !chatId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold transition-colors"
              >
                <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                <span>{isSending ? (lang === 'th' ? 'กำลังส่งข้อความ...' : 'Sending...') : (lang === 'th' ? 'ทดสอบส่งข้อความแจ้งเตือน' : 'Send Test Alert')}</span>
              </button>

              {testResult && (
                <div className={`flex items-center gap-1.5 text-xs ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notification Triggers Checklist */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2.5">
            <span className="font-bold text-white block">
              {lang === 'th' ? 'เลือกเหตุการณ์ที่ต้องการรับการแจ้งเตือน:' : 'Notification Events:'}
            </span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyOnTradeOpen}
                  onChange={(e) => onUpdateSettings({ ...settings, notifyOnTradeOpen: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>{lang === 'th' ? 'เมื่อเปิดคำสั่งซื้อขายใหม่' : 'When order is opened'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyOnTpSlHit}
                  onChange={(e) => onUpdateSettings({ ...settings, notifyOnTpSlHit: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>{lang === 'th' ? 'เมื่อแตะจุด TP หรือ Cut Loss' : 'Take Profit / Stop Loss hit'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyOnNewsBlackout}
                  onChange={(e) => onUpdateSettings({ ...settings, notifyOnNewsBlackout: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>{lang === 'th' ? 'เมื่อเข้าสู่ช่วง News Blackout' : 'News Blackout activated'}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyDailySummary}
                  onChange={(e) => onUpdateSettings({ ...settings, notifyDailySummary: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>{lang === 'th' ? 'สรุปผลกำไรรายวัน (00:00 UTC)' : 'Daily Profit Summary (00:00 UTC)'}</span>
              </label>
            </div>
          </div>

          {/* Telegram Preview Mockup */}
          <div className="space-y-1.5">
            <span className="text-slate-400 font-medium block">
              {lang === 'th' ? 'ตัวอย่างข้อความแจ้งเตือนบน Telegram:' : 'Sample Telegram Alert Preview:'}
            </span>
            <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-950/20 font-mono text-[11px] text-slate-200 space-y-1 max-w-sm">
              <div className="font-bold text-sky-400">⚡ QuantumTrade AI | เปิดคำสั่ง LONG BTC/USDT</div>
              <div className="text-slate-500">─────────────────────</div>
              <div><strong>เหรียญ:</strong> <code className="text-white">BTC/USDT 10x</code></div>
              <div><strong>ราคาเข้า:</strong> <code className="text-white">$68,420.50</code></div>
              <div><strong>Stop Loss:</strong> <code className="text-rose-400">$67,200.00 (-1.2%)</code></div>
              <div><strong>เป้าหมาย TP1:</strong> <code className="text-emerald-400">$70,200.00 (+2.6%)</code></div>
              <div><strong>ขนาดไม้:</strong> <code className="text-white">0.15 BTC (กระจาย 4 ไม้)</code></div>
              <div className="text-slate-500">─────────────────────</div>
              <div className="text-[10px] text-slate-400 italic">🕒 14:32:00 | 24/7 Google Cloud Free Tier</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            {lang === 'th' ? 'บันทึกการตั้งค่า' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
