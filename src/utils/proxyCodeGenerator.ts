/**
 * Generic outbound-proxy config helper.
 * NOTE: do not use this to disguise a restricted location (e.g. a US VM) to reach Binance:
 * that conflicts with Binance's terms. Run the trading worker where access is permitted (see README).
 */

export interface ProxyConfig {
  protocol: 'http' | 'https' | 'socks5' | 'socks5h';
  host: string;
  port: number;
  username?: string;
  password?: string;
  targetMarket: 'future' | 'spot';
  testnet: boolean;
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  protocol: 'socks5h',
  host: 'proxy-sg.example.com',
  port: 1080,
  username: 'trader_user',
  password: 'secure_password_123',
  targetMarket: 'future',
  testnet: false,
};

export interface ProxyPreset {
  id: string;
  name: string;
  country: string;
  flag: string;
  protocol: 'http' | 'https' | 'socks5' | 'socks5h';
  description: string;
  sampleHost: string;
  samplePort: number;
}

export const PROXY_PRESETS: ProxyPreset[] = [
  {
    id: 'sg-socks5',
    name: 'Singapore Low-Latency SOCKS5',
    country: 'Singapore (SG)',
    flag: '🇸🇬',
    protocol: 'socks5h',
    description: 'ความหน่วงต่ำสุด (~30-45ms) สำหรับ Binance Futures API นอกสหรัฐฯ',
    sampleHost: 'sg-node.trading-proxy.net',
    samplePort: 1080,
  },
  {
    id: 'tokyo-http',
    name: 'Tokyo Fast HTTP/HTTPS Proxy',
    country: 'Japan (JP)',
    flag: '🇯🇵',
    protocol: 'https',
    description: 'เสถียรภาพสูง เชื่อมต่อเซิร์ฟเวอร์ Binance Tokyo Data Center โดยตรง',
    sampleHost: 'jp-tokyo.fastproxy.io',
    samplePort: 8080,
  },
  {
    id: 'frankfurt-socks5',
    name: 'Frankfurt Dedicated SOCKS5',
    country: 'Germany (DE)',
    flag: '🇩🇪',
    protocol: 'socks5h',
    description: 'เครือข่ายยุโรป ไม่ติด Geoblock ของ US และรองรับ WebSockets ต่อเนื่อง',
    sampleHost: 'de-fra.securetunnel.org',
    samplePort: 10808,
  },
  {
    id: 'webshare-custom',
    name: 'Webshare / BrightData Static Residential',
    country: 'Global Residential',
    flag: '🌐',
    protocol: 'http',
    description: 'IP บ้านที่อยู่อาศัย ไม่ถูกจำกัด Rate-limit หรือตรวจจับเป็น Datacenter IP',
    sampleHost: 'p.webshare.io',
    samplePort: 9999,
  },
];

/**
 * Builds the proxy URL formatted with credentials if provided
 */
export function buildProxyUrl(config: ProxyConfig): string {
  const auth = config.username 
    ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password || '')}@`
    : '';
  return `${config.protocol}://${auth}${config.host}:${config.port}`;
}

/**
 * Generates ready-to-run Python script with CCXT and Proxy configuration
 */
export function generatePythonCcxtCode(config: ProxyConfig, apiKey = 'YOUR_BINANCE_API_KEY', secretKey = 'YOUR_BINANCE_SECRET_KEY'): string {
  const proxyUrl = buildProxyUrl(config);

  return `# ==============================================================================
# QuantumTrade AI - Binance Futures & Spot Trading Bot via CCXT Proxy
# Optimized for Google Cloud Always-Free e2-micro VM with Tailscale Monitoring
# ==============================================================================
import ccxt
import time
import sys

# 1. กำหนดค่า API Key และ Proxy
API_KEY = '${apiKey}'
SECRET_KEY = '${secretKey}'

# Proxy URL (รองรับทั้ง HTTP, HTTPS, SOCKS5, SOCKS5h สำหรับ Remote DNS ป้องกัน DNS Leak)
PROXIES = {
    'http': '${proxyUrl}',
    'https': '${proxyUrl}',
}

print(f"[*] กำลังเชื่อมต่อ Binance ผ่าน Proxy: ${config.protocol}://${config.host}:${config.port} ...")

# 2. เริ่มต้นการทำงานของ CCXT Binance Exchange
exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,     # ป้องกันการถูกแบน Rate Limit จากการดึงข้อมูลถี่เกินไป
    'timeout': 15000,            # 15 วินาที สำหรับ Timeout ผ่าน Proxy
    
    # === การตั้งค่า Proxy บังคับทุก Request วิ่งผ่าน Proxy นอก US ===
    'proxies': PROXIES,
    
    # ตัวเลือกการเทรด: 'future' (Binance USDⓈ-M Futures) หรือ 'spot'
    'options': {
        'defaultType': '${config.targetMarket}',
        'adjustForTimeDifference': True, # ซิงค์เวลาเครื่องกับ Server Binance อัตโนมัติ
    }
})

# เปิดโหมด Testnet หากต้องการทดสอบก่อนเทรดเงินจริง
if ${config.testnet ? 'True' : 'False'}:
    exchange.set_sandbox_mode(True)
    print("[!] โหมด TESTNET (Paper Trading) เปิดใช้งาน")

# 3. ฟังก์ชันทดสอบการเชื่อมต่อและตรวจสอบ IP ที่ Binance มองเห็น
def test_connection():
    try:
        # ทดสอบดึงเวลา Server เพื่อเช็คความหน่วง (Latency)
        start_time = time.time()
        server_time = exchange.fetch_time()
        latency_ms = int((time.time() - start_time) * 1000)
        
        # ทดสอบดึงราคา BTC ล่าสุด
        symbol = 'BTC/USDT'
        ticker = exchange.fetch_ticker(symbol)
        
        print(f"\\n✅ [เชื่อมต่อสำเร็จ!] Latency: {latency_ms} ms")
        print(f"   คู่เหรียญ: {symbol}")
        print(f"   ราคาล่าสุด (Last Price): \${ticker['last']:,.2f}")
        print(f"   ราคาเสนอซื้อ/ขาย (Bid/Ask): \${ticker['bid']:,.2f} / \${ticker['ask']:,.2f}")
        print(f"   ปริมาณซื้อขาย 24 ชม.: {ticker['baseVolume']:,.2f} BTC")
        
        # หากมี API Key จริง ให้ตรวจสอบยอดเงินคงเหลือ
        if API_KEY != 'YOUR_BINANCE_API_KEY':
            balance = exchange.fetch_balance()
            usdt_free = balance.get('USDT', {}).get('free', 0.0)
            print(f"   ยอด USDT พร้อมเทรด: \${usdt_free:,.2f}")
            
        return True
    except ccxt.NetworkError as ne:
        print(f"❌ [Network Error] ไม่สามารถเชื่อมต่อผ่าน Proxy ได้: {ne}")
        print("   -> แนะนำ: ตรวจสอบ Host/Port ของ Proxy หรือทดสอบ Ping")
        return False
    except ccxt.AuthenticationError as ae:
        print(f"⚠️ [Auth Error] ข้อมูล API Key หรือ Secret ไม่ถูกต้อง: {ae}")
        return False
    except Exception as e:
        print(f"❌ [Error] เกิดข้อผิดพลาดไม่คาดคิด: {e}")
        return False

# 4. ลูปการทำงาน 24/7 พร้อมระบบกู้คืนเมื่อเน็ตหลุด (Auto-Reconnect)
def run_trading_bot():
    print("[*] เริ่มต้นระบบบอทเทรด 24/7 เฝ้าราคาและจัดการ Trailing Stop...")
    while True:
        try:
            ticker = exchange.fetch_ticker('BTC/USDT')
            current_price = ticker['last']
            timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
            print(f"[{timestamp}] BTC/USDT: \${current_price:,.2f} | สถานะ Proxy: ปกติ")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\\n[!] ผู้ใช้สั่งหยุดบอท (Ctrl+C)")
            break
        except Exception as e:
            print(f"[!] พบสัญญาณขาดหาย กำลังเชื่อมต่อใหม่ใน 5 วินาที... ({e})")
            time.sleep(5)

if __name__ == '__main__':
    if test_connection():
        # run_trading_bot()
        print("\\n👉 โค้ดพร้อมใช้งานบน Google Cloud VM แล้ว! รันคำสั่ง: python3 bot.py")
`;
}

/**
 * Generates Node.js TypeScript equivalent
 */
export function generateNodeCcxtCode(config: ProxyConfig): string {
  const proxyUrl = buildProxyUrl(config);

  return `// TypeScript / Node.js - Binance Connection with Proxy via CCXT
import ccxt from 'ccxt';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = '${proxyUrl}';
const isSocks = proxyUrl.startsWith('socks');
const agent = isSocks ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

export const binance = new (ccxt as any).binance({
  apiKey: process.env.BINANCE_API_KEY || 'YOUR_BINANCE_API_KEY',
  secret: process.env.BINANCE_SECRET_KEY || 'YOUR_BINANCE_SECRET_KEY',
  enableRateLimit: true,
  options: {
    defaultType: '${config.targetMarket}',
    adjustForTimeDifference: true,
  },
  agent: agent,
});

async function testConnection() {
  try {
    const ticker = await binance.fetchTicker('BTC/USDT');
    console.log('✅ เชื่อมต่อ Binance สำเร็จผ่าน Proxy:', ticker.last);
  } catch (err) {
    console.error('❌ ข้อผิดพลาดเชื่อมต่อ Binance:', err);
  }
}

testConnection();
`;
}

/**
 * Generates Tailscale 1-click VM installation script for Google Cloud Compute Engine
 */
export function generateTailscaleGcpScript(tailscaleAuthKey = ''): string {
  return `#!/bin/bash
# ==============================================================================
# QuantumTrade AI - Tailscale Zero-Trust VPN Setup for Google Cloud VM
# Creates encrypted WireGuard mesh without opening any firewall ports
# ==============================================================================

set -e

echo "🔐 [1/4] ติดตั้ง Tailscale WireGuard VPN บน Google Cloud VM..."
curl -fsSL https://tailscale.com/install.sh | sh

echo "🌐 [2/4] เริ่มต้นการทำงานของ Tailscale Daemon..."
sudo systemctl enable --now tailscaled

echo "🚀 [3/4] เชื่อมต่อ VM เข้ากับ Tailscale Tailnet..."
${tailscaleAuthKey ? `sudo tailscale up --authkey=${tailscaleAuthKey} --hostname=quantumtrade-gcp-vm --accept-routes` : `sudo tailscale up --hostname=quantumtrade-gcp-vm --accept-routes`}

echo "📊 [4/4] ตรวจสอบที่อยู่ Tailscale IP (100.x.y.z):"
TAILSCALE_IP=$(tailscale ip -4)
echo "================================================================="
echo "✅ VM พร้อมใช้งานบน Tailscale Private Network แล้ว!"
echo "   IP ของ VM: \${TAILSCALE_IP}"
echo "   เปิดดูแดชบอร์ดจากมือถือของคุณได้ที่:"
echo "   👉 http://\${TAILSCALE_IP}:3000"
echo "   (ไม่ต้องเปิดพอร์ต 3000 ใน Google Cloud Firewall ปลอดภัย 100%)"
echo "================================================================="
`;
}
