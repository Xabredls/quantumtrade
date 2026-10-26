import React, { useState, useId } from 'react';
import { 
  Lock, 
  ShieldCheck, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Key, 
  HardDrive,
  Info
} from 'lucide-react';
import { encryptPayload, decryptPayload, triggerFileDownload } from '../utils/securityVault';
import { AccountPortfolio, TelegramSettings, SystemRiskConfig } from '../types/trading';

interface SecurityVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountPortfolio[];
  telegramSettings: TelegramSettings;
  riskConfig: SystemRiskConfig;
  onRestoreBackup: (data: { accounts: AccountPortfolio[]; telegramSettings: TelegramSettings }) => void;
  lang: 'th' | 'en';
}

export const SecurityVaultModal: React.FC<SecurityVaultModalProps> = ({
  isOpen,
  onClose,
  accounts,
  telegramSettings,
  riskConfig,
  onRestoreBackup,
  lang,
}) => {
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const passId = useId();
  const confirmPassId = useId();
  const fileInputId = useId();

  if (!isOpen) return null;

  const handleExportBackup = async () => {
    if (!passphrase || passphrase.length < 8) {
      setStatusMessage({
        type: 'ERROR',
        text: lang === 'th' ? 'กรุณากำหนดรหัสผ่านอย่างน้อย 8 ตัวอักษร เพื่อใช้ในการเข้ารหัส AES-256' : 'Passphrase must be at least 8 characters for AES-256 encryption.',
      });
      return;
    }

    if (passphrase !== confirmPass) {
      setStatusMessage({
        type: 'ERROR',
        text: lang === 'th' ? 'รหัสผ่านยืนยันไม่ตรงกัน' : 'Passphrases do not match.',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const backupData = {
        version: 1,
        createdAt: new Date().toISOString(),
        accounts,
        telegramSettings,
        riskConfig,
      };

      const encrypted = await encryptPayload(backupData, passphrase);
      const filename = `quantumtrade_backup_${new Date().toISOString().slice(0, 10)}.json.enc`;
      triggerFileDownload(encrypted, filename, 'application/octet-stream');

      setStatusMessage({
        type: 'SUCCESS',
        text: lang === 'th' ? 'ส่งออกไฟล์สำรองข้อมูลที่เข้ารหัส AES-GCM สำเร็จเรียบร้อย!' : 'Encrypted backup exported successfully!',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'ERROR',
        text: err.message || 'Export error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!passphrase) {
      setStatusMessage({
        type: 'ERROR',
        text: lang === 'th' ? 'กรุณาป้อนรหัสผ่านเพื่อถอดรหัสไฟล์สำรองข้อมูล' : 'Enter your master passphrase to decrypt the backup file.',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const text = await file.text();
      const decrypted = await decryptPayload(text, passphrase);
      
      if (decrypted.accounts) {
        onRestoreBackup({
          accounts: decrypted.accounts,
          telegramSettings: decrypted.telegramSettings || telegramSettings,
        });

        setStatusMessage({
          type: 'SUCCESS',
          text: lang === 'th' ? 'ถอดรหัสและกู้คืนข้อมูลพอร์ตโฟลิโอสำเร็จสมบูรณ์!' : 'Backup restored successfully!',
        });
      } else {
        throw new Error('Invalid backup file payload');
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'ERROR',
        text: lang === 'th' ? 'รหัสผ่านไม่ถูกต้อง หรือไฟล์เสียหาย' : 'Invalid passphrase or corrupted backup file.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {lang === 'th' ? 'ตู้เซฟความปลอดภัย & ระบบสำรองข้อมูลรายวัน' : 'Security Vault & Daily Encrypted Backups'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'th' ? 'เข้ารหัสระดับอุตสาหกรรม AES-GCM 256-bit + PBKDF2 ปกป้อง API Key ในเครื่องของคุณ 100%' : 'Industrial-grade AES-GCM 256-bit client-side encryption for API keys.'}
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
          
          {/* Status Alert */}
          {statusMessage && (
            <div className={`p-3 rounded-lg border flex items-center gap-2 ${
              statusMessage.type === 'SUCCESS' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}>
              {statusMessage.type === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Master Passphrase Setup */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white block">
                {lang === 'th' ? 'รหัสผ่านหลัก (Master Passphrase สำหรับการเข้ารหัส):' : 'Master Passphrase (AES-GCM Key):'}
              </span>
              <span className="text-[11px] font-mono text-emerald-400">AES-256 + PBKDF2</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={passId} className="block text-slate-400 text-[11px] mb-1">{lang === 'th' ? 'รหัสผ่านหลัก' : 'Passphrase'}</label>
                <input
                  id={passId}
                  type="password"
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor={confirmPassId} className="block text-slate-400 text-[11px] mb-1">{lang === 'th' ? 'ยืนยันรหัสผ่าน' : 'Confirm Passphrase'}</label>
                <input
                  id={confirmPassId}
                  type="password"
                  placeholder="พิมพ์ซ้ำอีกครั้ง"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Actions: Export & Import */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Export Card */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
              <span className="font-bold text-white block">
                {lang === 'th' ? '1. สำรองข้อมูลแบบเข้ารหัส' : '1. Export Encrypted Vault'}
              </span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {lang === 'th'
                  ? 'ดาวน์โหลดไฟล์ .json.enc ที่บรรจุข้อมูลบัญชี, กลยุทธ์ และกุญแจ API ทั้งหมด โดยถูกเข้ารหัสอย่างปลอดภัย'
                  : 'Exports all accounts, trading configs, and encrypted API keys to a secure .json.enc file.'}
              </p>
              <button
                onClick={handleExportBackup}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'th' ? 'ดาวน์โหลดไฟล์สำรองข้อมูล (.json.enc)' : 'Export Backup File'}</span>
              </button>
            </div>

            {/* Import Card */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
              <span className="font-bold text-white block">
                {lang === 'th' ? '2. กู้คืนข้อมูลจากไฟล์สำรอง' : '2. Restore from Backup'}
              </span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {lang === 'th'
                  ? 'เลือกไฟล์ .json.enc ที่เคยสำรองไว้ และป้อนรหัสผ่านหลักเพื่อนำเข้าพอร์ตและคอนฟิกทั้งหมด'
                  : 'Select an existing .json.enc backup file and decrypt with your master passphrase.'}
              </p>
              <label 
                htmlFor={fileInputId}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer border border-slate-700 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>{lang === 'th' ? 'เลือกไฟล์ .json.enc เพื่อกู้คืน' : 'Upload Backup File'}</span>
              </label>
              <input
                id={fileInputId}
                type="file"
                accept=".json,.enc,.json.enc"
                onChange={handleImportBackup}
                className="hidden"
              />
            </div>
          </div>

          {/* Security Best Practices Reminder */}
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2 text-slate-300">
            <span className="font-bold text-emerald-400 text-xs block">
              {lang === 'th' ? 'ข้อแนะนำความปลอดภัยระดับอุตสาหกรรม (Security Best Practices):' : 'Industrial Security Best Practices:'}
            </span>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li>
                <strong>{lang === 'th' ? 'ห้ามเปิดสิทธิ์การถอนเงินเด็ดขาด (Disable Withdrawals)' : 'Never enable Withdrawal permissions'}</strong>: ให้เปิดเฉพาะสิทธิ์ Read (อ่านข้อมูล) และ Enable Futures (เปิด/ปิดสัญญา) เท่านั้น
              </li>
              <li>
                <strong>{lang === 'th' ? 'ล็อก IP Address (IP Whitelisting)' : 'IP Whitelist on Exchange'}</strong>: กำหนดให้เฉพาะ IP ของ Google Cloud VM เท่านั้นที่สามารถเรียกใช้ API ได้
              </li>
              <li>
                <strong>{lang === 'th' ? 'รหัสผ่านอยู่ในเบราว์เซอร์ของคุณ' : 'Zero-Knowledge Storage'}</strong>: กุญแจ API จะไม่ถูกส่งไปเก็บที่เซิร์ฟเวอร์ภายนอกใดๆ แต่ถูกเข้ารหัสในเครื่องของคุณโดยตรง
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            {lang === 'th' ? 'ปิดหน้าต่าง' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
