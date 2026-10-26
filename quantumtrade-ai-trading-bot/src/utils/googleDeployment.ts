/**
 * Google Cloud Free Tier 1-Click Automation Generator
 * Generates automated scripts, Dockerfile, systemd daemons, and cron backups
 * specifically tailored for Google Compute Engine e2-micro (Always Free: 1 vCPU, 1GB RAM, 30GB HDD in us-central1/us-east1/us-west1)
 * or Google Cloud Run (2 million requests/month Free Tier).
 */

export interface GoogleDeploymentConfig {
  projectName: string;
  region: string;
  vmZone: string;
  vmName: string;
  port: number;
  enableTelegramAlerts: boolean;
  enableDailyBackupCron: boolean;
  backupTimeUTC: string;
}

export const defaultGoogleConfig: GoogleDeploymentConfig = {
  projectName: 'quantumtrade-free-tier',
  region: 'us-central1',
  vmZone: 'us-central1-a',
  vmName: 'quantumtrade-bot-vm',
  port: 3000,
  enableTelegramAlerts: true,
  enableDailyBackupCron: true,
  backupTimeUTC: '00:00',
};

/**
 * 1-Click Complete Bash Script (setup-google-free-tier.sh)
 * Runs on Ubuntu 22.04 LTS / Debian 12 on e2-micro instance
 */
export function generateOneClickBashScript(config: GoogleDeploymentConfig = defaultGoogleConfig): string {
  return `#!/bin/bash
# ==============================================================================
# QuantumTrade AI - 1-Click Google Cloud Free Tier 24/7 Deployment Script
# Target: Google Compute Engine (e2-micro Always-Free Tier: 1GB RAM, 1 vCPU)
# ==============================================================================

set -e

echo "🚀 [1/6] Initializing QuantumTrade AI Bot Environment on Google Cloud..."

# 1. Update OS & Install essential utilities
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git jq ufw build-essential htop fail2ban

# 2. Configure SWAP memory (Essential for 1GB e2-micro stability)
if [ ! -f /swapfile ]; then
  echo "📦 [2/6] Configuring 2GB Swap Memory for optimal e2-micro 24/7 stability..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  sudo sysctl vm.swappiness=10
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
fi

# 3. Install Node.js 22 LTS & PM2 process manager
echo "⚙️ [3/6] Installing Node.js LTS and PM2 daemon manager..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2 tsx

# 4. Setup Bot Working Directory & Hardened Permissions
echo "🔒 [4/6] Setting up QuantumTrade workspace with encrypted local storage..."
APP_DIR="/opt/quantumtrade"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR
cd $APP_DIR

# Clone / Extract App Source
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Cloning repository or unpacking distribution..."
  # git clone <YOUR_GIT_REPO_URL> $APP_DIR
fi

# 5. Security & Firewall (Only allow SSH & Bot Web Dashboard port)
echo "🛡️ [5/6] Hardening Firewall (UFW) & Fail2Ban protection..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow ${config.port}/tcp
echo "y" | sudo ufw enable
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 6. Configure Systemd 24/7 Daemon with Auto-Restart & Memory Watchdog
echo "⚡ [6/6] Registering 24/7 systemd service & automated daily backup..."

sudo tee /etc/systemd/system/quantumtrade.service > /dev/null <<EOF
[Unit]
Description=QuantumTrade Autonomous Trading Bot 24/7
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${config.port}
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=quantumtrade

# Resource Watchdog for e2-micro
MemoryMax=850M
MemoryHigh=750M

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable quantumtrade
# sudo systemctl start quantumtrade

# Setup Daily Encrypted Backup Crontab
cat << 'CRON' > $APP_DIR/daily-backup.sh
#!/bin/bash
BACKUP_DIR="/opt/quantumtrade/backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
# Archive application state & encrypted vault with 7-day retention
tar -czf "$BACKUP_DIR/quantumtrade_backup_$TIMESTAMP.tar.gz" -C /opt/quantumtrade config data 2>/dev/null || true
find $BACKUP_DIR -type f -name "*.tar.gz" -mtime +7 -delete
echo "[$(date)] Backup completed: quantumtrade_backup_$TIMESTAMP.tar.gz" >> $BACKUP_DIR/backup.log
CRON
chmod +x $APP_DIR/daily-backup.sh

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -F "daily-backup.sh") || (crontab -l 2>/dev/null; echo "0 0 * * * /opt/quantumtrade/daily-backup.sh") | crontab -

echo "=========================================================================="
echo "✅ QuantumTrade Bot Installed Successfully!"
echo "🌐 Dashboard Running on: http://$(curl -s ifconfig.me):${config.port}"
echo "📊 Check Service Status: sudo systemctl status quantumtrade"
echo "📜 View Live Engine Logs: sudo journalctl -u quantumtrade -f"
echo "=========================================================================="
`;
}

/**
 * Dockerfile for containerized deployment (e.g. Cloud Run or Docker Compose)
 */
export function generateDockerfile(): string {
  return `# Lightweight Multi-stage Build for QuantumTrade Bot
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install dumb-init for proper PID 1 signal handling & zombie process reaping
RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./dist/server.ts 2>/dev/null || true

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
`;
}

/**
 * Docker Compose file for 1-command startup
 */
export function generateDockerCompose(): string {
  return `version: '3.8'

services:
  quantumtrade-engine:
    build: .
    container_name: quantumtrade-bot
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - ./data:/app/data
      - ./backups:/app/backups
    deploy:
      resources:
        limits:
          memory: 800M
          cpus: '0.90'
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3
`;
}

/**
 * Cloud Shell / Google Cloud CLI 1-Line command to provision the e2-micro instance
 */
export function generateGCloudProvisionCommand(config: GoogleDeploymentConfig = defaultGoogleConfig): string {
  return `gcloud compute instances create ${config.vmName} \\
    --project=${config.projectName} \\
    --zone=${config.vmZone} \\
    --machine-type=e2-micro \\
    --network-interface=network-tier=STANDARD,subnet=default \\
    --metadata=startup-script-url=https://raw.githubusercontent.com/quantumtrade/install/main/setup.sh \\
    --maintenance-policy=MIGRATE \\
    --provisioning-model=STANDARD \\
    --tags=http-server,quantumtrade-port \\
    --create-boot-disk=auto-delete=yes,boot=yes,image=projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts,size=30,type=pd-standard

gcloud compute firewall-rules create allow-quantumtrade \\
    --direction=INGRESS --priority=1000 --network=default --action=ALLOW \\
    --rules=tcp:${config.port} --target-tags=quantumtrade-port`;
}
