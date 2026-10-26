import React, { useState, useId } from 'react';
import { 
  Radio, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  ShieldAlert, 
  Sliders, 
  CheckCircle2, 
  XCircle,
  TrendingDown,
  Globe
} from 'lucide-react';
import { NewsBlackoutEvent } from '../types/trading';

interface NewsRadarViewProps {
  newsEvents: NewsBlackoutEvent[];
  isBlackoutActive: boolean;
  activeTriggerNews?: { id: string; title: string; currency?: string; impact?: string } | null;
  blackoutMinutesBefore: number;
  setBlackoutMinutesBefore: (m: number) => void;
  blackoutMinutesAfter: number;
  setBlackoutMinutesAfter: (m: number) => void;
  avoidRolloverHours: boolean;
  setAvoidRolloverHours: (avoid: boolean) => void;
  onSimulateNewsSpike: () => void;
  lang: 'th' | 'en';
}

export const NewsRadarView: React.FC<NewsRadarViewProps> = ({
  newsEvents,
  isBlackoutActive,
  activeTriggerNews,
  blackoutMinutesBefore,
  setBlackoutMinutesBefore,
  blackoutMinutesAfter,
  setBlackoutMinutesAfter,
  avoidRolloverHours,
  setAvoidRolloverHours,
  onSimulateNewsSpike,
  lang,
}) => {
  const currentUtc = new Date();
  const utcHours = currentUtc.getUTCHours();
  const utcMinutes = currentUtc.getUTCMinutes();

  const minutesBeforeId = useId();
  const minutesAfterId = useId();

  // Sessions calculation
  const isTokyoOpen = utcHours >= 0 && utcHours < 9;
  const isLondonOpen = utcHours >= 7 && utcHours < 16;
  const isNewYorkOpen = utcHours >= 12 && utcHours < 21;
  const isOverlap = utcHours >= 12 && utcHours < 16;
  const isRolloverDanger = (utcHours === 21 && utcMinutes >= 50) || (utcHours === 22 && utcMinutes <= 20);

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Blackout Engine Status */}
      <div className={`p-5 rounded-xl border transition-all ${
        isBlackoutActive 
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' 
          : 'border-slate-800 bg-slate-900/60 text-slate-300'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${
              isBlackoutActive ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{lang === 'th' ? 'เรดาร์ดักจับข่าวแรง & ช่วงเวลาที่มีผลต่อกำไร' : 'High-Impact News & Volatility Radar'}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  isBlackoutActive ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {isBlackoutActive ? (lang === 'th' ? 'BLACKOUT กำลังทำงาน' : 'BLACKOUT ACTIVE') : (lang === 'th' ? 'สภาวะปกติ (SAFE)' : 'SAFE TO TRADE')}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isBlackoutActive 
                  ? (lang === 'th' ? `ตรวจพบเหตุการณ์: ${activeTriggerNews?.title || 'ช่วงสเปรดถ่างสูง'} — บอทระงับเปิดออเดอร์ใหม่ชั่วคราว` : `Event in range: ${activeTriggerNews?.title || 'High Spread Rollover'} — New orders paused.`)
                  : (lang === 'th' ? 'ไม่มีข่าวรุนแรงในกรอบเวลาปัจจุบัน บอททำการ Day Trade ได้ตามปกติ' : 'No imminent high-impact macro disruptions. Day trading engine operating normally.')}
              </p>
            </div>
          </div>

          <button
            onClick={onSimulateNewsSpike}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{lang === 'th' ? 'ทดสอบจำลองข่าวแรงกะทันหัน' : 'Simulate News Shock'}</span>
          </button>
        </div>
      </div>

      {/* Grid: Global Session Clock + News Blackout Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Session Liquidity & Spread Protection Card (6 Cols) */}
        <div className="lg:col-span-6 p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>{lang === 'th' ? 'ช่วงเวลาตลาดและการหลีกเลี่ยงสเปรดถ่าง' : 'Trading Sessions & Liquidity Radar'}</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              UTC: {currentUtc.toUTCString().slice(17, 22)}
            </span>
          </div>

          <div className="space-y-3">
            {/* London / NY Overlap (Golden Hour) */}
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              isOverlap ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-950'
            }`}>
              <div className="space-y-0.5">
                <span className="font-bold text-white">London - New York Overlap (12:00 - 16:00 UTC)</span>
                <p className="text-slate-400 text-[11px]">
                  {lang === 'th' ? 'ช่วงสภาพคล่องสูงสุด สเปรดแคบที่สุด เหมาะแก่การทำ Day Trade กำไรไว' : 'Peak global liquidity and lowest spread. Prime window for Day Trade scalping.'}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isOverlap ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-800 text-slate-500'
              }`}>
                {isOverlap ? 'ACTIVE' : 'OFF'}
              </span>
            </div>

            {/* Daily Broker Rollover Period (Danger Zone) */}
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              isRolloverDanger ? 'border-rose-500/50 bg-rose-500/10' : 'border-slate-800 bg-slate-950'
            }`}>
              <div className="space-y-0.5">
                <span className="font-bold text-rose-300">Daily Broker Rollover (21:55 - 22:15 UTC)</span>
                <p className="text-slate-400 text-[11px]">
                  {lang === 'th' ? 'โบรกเกอร์คิด Swap และสเปรดจะถ่างกว้างผิดปกติ บอทจะหลีกเลี่ยงการเปิดคำสั่งซื้อขาย' : 'Brokers swap calculation window. Spreads widen up to 10x. Orders paused.'}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isRolloverDanger ? 'bg-rose-500/30 text-rose-300 animate-pulse' : 'bg-slate-800 text-slate-500'
              }`}>
                {isRolloverDanger ? 'BLOCKED' : 'AVOIDED'}
              </span>
            </div>

            {/* Individual Sessions */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
              <div className={`p-2.5 rounded-lg border ${isTokyoOpen ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>
                <div className="text-[10px] uppercase">{lang === 'th' ? 'โตเกียว' : 'Tokyo'}</div>
                <div className="font-bold text-sm">00 - 09 UTC</div>
              </div>
              <div className={`p-2.5 rounded-lg border ${isLondonOpen ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>
                <div className="text-[10px] uppercase">{lang === 'th' ? 'ลอนดอน' : 'London'}</div>
                <div className="font-bold text-sm">07 - 16 UTC</div>
              </div>
              <div className={`p-2.5 rounded-lg border ${isNewYorkOpen ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>
                <div className="text-[10px] uppercase">{lang === 'th' ? 'นิวยอร์ก' : 'New York'}</div>
                <div className="font-bold text-sm">12 - 21 UTC</div>
              </div>
            </div>
          </div>
        </div>

        {/* Blackout Window Configuration Card (6 Cols) */}
        <div className="lg:col-span-6 p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'th' ? 'ตั้งค่าระยะเวลาหลบหลีกข่าว (Blackout Buffer)' : 'News Blackout Protection Settings'}</span>
            </h3>
            <span className="text-xs text-emerald-400 font-mono">Auto-Protected</span>
          </div>

          <div className="space-y-4">
            {/* Minutes Before Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={minutesBeforeId} className="text-slate-300">
                  {lang === 'th' ? 'หยุดรับคำสั่งซื้อล่วงหน้าก่อนข่าวออก' : 'Pause trading BEFORE event'}:
                </label>
                <span className="font-mono font-bold text-amber-400">{blackoutMinutesBefore} นาที (Mins)</span>
              </div>
              <input
                id={minutesBeforeId}
                type="range"
                min="5"
                max="60"
                step="5"
                value={blackoutMinutesBefore}
                onChange={(e) => setBlackoutMinutesBefore(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>5m</span>
                <span>30m (แนะนำ)</span>
                <span>60m</span>
              </div>
            </div>

            {/* Minutes After Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={minutesAfterId} className="text-slate-300">
                  {lang === 'th' ? 'รอให้ตลาดนิ่งหลังข่าวออกก่อนกลับมาเทรด' : 'Resume trading AFTER event'}:
                </label>
                <span className="font-mono font-bold text-amber-400">{blackoutMinutesAfter} นาที (Mins)</span>
              </div>
              <input
                id={minutesAfterId}
                type="range"
                min="5"
                max="60"
                step="5"
                value={blackoutMinutesAfter}
                onChange={(e) => setBlackoutMinutesAfter(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>5m</span>
                <span>30m (แนะนำ)</span>
                <span>60m</span>
              </div>
            </div>

            {/* Auto Rollover Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-200">
                  {lang === 'th' ? 'ระบบหลบช่วงเปลี่ยนวัน Forex (Rollover Avoidance)' : 'Auto Rollover Avoidance'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {lang === 'th' ? 'ตัดคำสั่งซื้อขายอัตโนมัติในช่วง 21:55 - 22:15 UTC เพื่อป้องกันค่าสเปรดกินทุน' : 'Automatically prevents trades during 21:55 - 22:15 UTC spread spikes.'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={avoidRolloverHours}
                onChange={(e) => setAvoidRolloverHours(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Economic Calendar List */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'th' ? 'ปฏิทินข่าวเศรษฐกิจที่มีผลกระทบสูง (High-Impact Economic Events)' : 'High-Impact Economic Calendar'}</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {lang === 'th' ? 'เชื่อมต่อ API ปฏิทินเศรษฐกิจแบบสด' : 'Live Sync Feed'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800 bg-slate-950/60 font-mono">
              <tr>
                <th className="py-2.5 px-3">{lang === 'th' ? 'สกุลเงิน' : 'Currency'}</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'เหตุการณ์ / ประกาศ' : 'Event'}</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'ระดับความรุนแรง' : 'Impact'}</th>
                <th className="py-2.5 px-3">{lang === 'th' ? 'กำหนดการ' : 'Time'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'th' ? 'ตัวเลขคาดการณ์' : 'Forecast'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'th' ? 'ครั้งก่อนหน้า' : 'Previous'}</th>
                <th className="py-2.5 px-3 text-center">{lang === 'th' ? 'สถานะ Blackout' : 'Blackout Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {newsEvents.map((ev) => {
                const diffMins = Math.round((ev.timestamp - Date.now()) / (60 * 1000));
                const inBlackout = diffMins <= blackoutMinutesBefore && diffMins >= -blackoutMinutesAfter;
                return (
                  <tr key={ev.id} className="hover:bg-slate-800/20">
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">
                        {ev.currency}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans font-semibold text-slate-200">
                      <div>{ev.title}</div>
                      <div className="text-[11px] font-normal text-slate-400 mt-0.5">{ev.description}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ev.impact === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {ev.impact}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({diffMins > 0 ? `ในอีก ${diffMins} นาที` : `${Math.abs(diffMins)} นาทีที่แล้ว`})
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">{ev.forecast || '-'}</td>
                    <td className="py-3 px-3 text-right text-slate-400">{ev.previous || '-'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                        inBlackout 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse' 
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {inBlackout ? (lang === 'th' ? 'ระงับการเทรด' : 'PAUSED') : (lang === 'th' ? 'รอจังหวะ' : 'MONITORING')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
