#!/bin/bash
# Dashboard + Gemini endpoint on the Google free-tier e2-micro (US region is fine: it never calls Binance).
# Run on the VM after copying the project to ~/quantumtrade (gcloud compute scp --recurse).
set -euo pipefail
APP=~/quantumtrade
sudo apt-get update -y && sudo apt-get install -y curl ufw fail2ban
if [ ! -f /swapfile ]; then sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab; fi
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
curl -fsSL https://tailscale.com/install.sh | sh
echo ">> Run: sudo tailscale up --hostname=quantumtrade-vm   (then put its 100.x IP in HOST in $APP/.env)"
cd "$APP" && cp -n .env.example .env && npm ci && npm run build
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp && sudo ufw allow in on tailscale0   # port 3000 is NOT opened to the internet
yes | sudo ufw enable
sudo tee /etc/systemd/system/quantumtrade.service >/dev/null <<UNIT
[Unit]
Description=QuantumTrade dashboard
After=network-online.target
[Service]
User=$USER
WorkingDirectory=$APP
EnvironmentFile=$APP/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx tsx server.ts
Restart=always
RestartSec=5
MemoryMax=800M
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now quantumtrade
