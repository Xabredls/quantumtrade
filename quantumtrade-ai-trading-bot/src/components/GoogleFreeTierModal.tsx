import React, { useState } from 'react';
import { 
  CloudLightning, 
  Terminal, 
  Copy, 
  Check, 
  Download, 
  Server, 
  ShieldCheck, 
  Cpu, 
  Layers, 
  FileCode2,
  HardDrive
} from 'lucide-react';
import { 
  generateOneClickBashScript, 
  generateDockerfile, 
  generateDockerCompose, 
  generateGCloudProvisionCommand,
  defaultGoogleConfig 
} from '../utils/googleDeployment';
import { triggerFileDownload } from '../utils/securityVault';

interface GoogleFreeTierModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'th' | 'en';
}

export const GoogleFreeTierModal: React.FC<GoogleFreeTierModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<'script' | 'gcloud' | 'docker' | 'architecture'>('script');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const bashScript = generateOneClickBashScript();
  const gcloudCmd = generateGCloudProvisionCommand();
  const dockerfile = generateDockerfile();
  const dockerCompose = generateDockerCompose();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    triggerFileDownload(bashScript, 'setup-google-free-tier.sh', 'application/x-sh');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <CloudLightning className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {lang === 'th' ? 'ระบบติดตั้งคลิกเดียวจบสำหรับ Google Cloud Free Tier (24/7)' : '1-Click Google Free Tier 24/7 Deployment Hub'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'th' ? 'รองรับการรันบอทต่อเนื่องตลอด 24 ชั่วโมง โดยไม่มีค่าใช้จ่ายเซิร์ฟเวอร์ (Always-Free e2-micro)' : 'Runs 24/7 autonomously on Google Compute Engine e2-micro Always Free Tier.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800/80 bg-slate-950/20 text-xs">
          <button
            onClick={() => setActiveTab('script')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'script' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'th' ? 'สคริปต์ 1-Click (Bash)' : '1-Click Bash Script'}
          </button>

          <button
            onClick={() => setActiveTab('gcloud')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'gcloud' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'th' ? 'คำสั่ง gcloud สร้าง VM' : 'GCloud CLI Provision'}
          </button>

          <button
            onClick={() => setActiveTab('docker')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'docker' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'th' ? 'Dockerfile & Compose' : 'Docker & Container'}
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'architecture' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'th' ? 'สถาปัตยกรรม 24/7' : '24/7 Architecture'}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          
          {activeTab === 'script' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">
                  {lang === 'th'
                    ? 'สคริปต์นี้จะติดตั้ง Node 22, ตั้งค่า SWAP 2GB ป้องกัน RAM เต็ม, สร้าง systemd service รันตลอดเวลา และระบบสำรองข้อมูลรายวันอัตโนมัติ'
                    : 'Configures Node 22, 2GB SWAP guard for 1GB RAM, systemd daemon with auto-restart, and daily cron backup.'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(bashScript)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'คัดลอกแล้ว' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleDownloadScript}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .sh</span>
                  </button>
                </div>
              </div>

              <div className="relative rounded-lg bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-72">
                <pre>{bashScript}</pre>
              </div>

              {/* Step by step terminal guide */}
              <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-2 text-slate-300">
                <span className="font-bold text-sky-400 block text-xs">
                  {lang === 'th' ? 'วิธีติดตั้งใน 3 ขั้นตอนง่ายๆ บน Google Cloud Shell:' : '3-Step Setup in Google Cloud Shell:'}
                </span>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                  <li>
                    {lang === 'th' ? 'เปิดเว็บ' : 'Open'}{' '}
                    <a href="https://shell.cloud.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">
                      Google Cloud Shell (ฟรี)
                    </a>
                  </li>
                  <li>
                    {lang === 'th' ? 'สร้าง VM Free Tier (e2-micro) หรือเชื่อมต่อ SSH เข้าสู่เซิร์ฟเวอร์ของคุณ' : 'Provision the free e2-micro VM or SSH into your machine.'}
                  </li>
                  <li>
                    {lang === 'th' ? 'ดาวน์โหลดไฟล์ setup-google-free-tier.sh แล้วสั่งรันด้วยคำสั่ง:' : 'Run the automated setup script with:'}{' '}
                    <code className="text-emerald-400 font-mono bg-slate-950 px-1 py-0.5 rounded">bash setup-google-free-tier.sh</code>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'gcloud' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">
                  {lang === 'th' ? 'คำสั่งสร้าง VM e2-micro แบบฟรีตลอดชีพ ผ่าน gcloud CLI:' : 'Command to provision Always-Free e2-micro instance:'}
                </span>
                <button
                  onClick={() => handleCopy(gcloudCmd)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'คัดลอกแล้ว' : 'Copy'}</span>
                </button>
              </div>

              <div className="rounded-lg bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                <pre>{gcloudCmd}</pre>
              </div>

              <div className="text-slate-400 text-[11px] space-y-1">
                <p>• <strong>e2-micro</strong>: 1 vCPU, 1 GB RAM อยู่ในข้อเสนอ Always Free ของ Google ในโซน us-central1, us-east1 หรือ us-west1</p>
                <p>• <strong>Standard Persistent Disk 30GB</strong>: ฟรีตลอดชีพภายใต้โควตา Free Tier</p>
              </div>
            </div>
          )}

          {activeTab === 'docker' && (
            <div className="space-y-4">
              <div>
                <span className="text-slate-300 font-medium block mb-2">Dockerfile (Alpine Multi-Stage Build):</span>
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48">
                  <pre>{dockerfile}</pre>
                </div>
              </div>

              <div>
                <span className="text-slate-300 font-medium block mb-2">docker-compose.yml:</span>
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48">
                  <pre>{dockerCompose}</pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4 text-slate-300 leading-relaxed text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-white block">2GB Swap Memory</span>
                  <p className="text-slate-400 text-[11px]">
                    ป้องกัน OOM (Out-of-memory) บนเครื่อง e2-micro ที่มี RAM 1GB ทำให้บอทรันได้ต่อเนื่องไม่มีดับ
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <Server className="w-4 h-4 text-sky-400" />
                  <span className="font-bold text-white block">Systemd 24/7 Watchdog</span>
                  <p className="text-slate-400 text-[11px]">
                    บริการระดับ OS พร้อมระบบ RestartSec=5 ทำการรีสตาร์ทบอทขึ้นมาใหม่ทันทีหากเกิดข้อผิดพลาด
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white block">Daily Auto-Backup</span>
                  <p className="text-slate-400 text-[11px]">
                    Crontab สำรองไฟล์คอนฟิกและสถานะทุกเที่ยงคืน พร้อมลบไฟล์เก่าที่เกิน 7 วันอัตโนมัติ
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            {lang === 'th' ? 'ปิดหน้าต่าง' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
