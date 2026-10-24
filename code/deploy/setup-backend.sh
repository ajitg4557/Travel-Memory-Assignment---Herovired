#!/bin/bash
# =====================================================================
#  OPTIONAL shortcut: sets up the FIRST backend EC2 instance in one go.
#  The guide does the same thing step by step (recommended the first time).
#
#  Usage (on the backend EC2, as the ubuntu user):
#     sudo git clone https://github.com/<YOUR_GITHUB_USERNAME>/devops-task-board.git /opt/taskboard
#     sudo chown -R ubuntu:ubuntu /opt/taskboard
#     cp /opt/taskboard/backend/.env.example /opt/taskboard/backend/.env
#     nano /opt/taskboard/backend/.env          # put your real MONGO_URI
#     bash /opt/taskboard/deploy/setup-backend.sh
# =====================================================================
set -euo pipefail
APP=/opt/taskboard

if [ ! -f "$APP/backend/.env" ] || grep -q '<db_password>' "$APP/backend/.env"; then
  echo "ERROR: create $APP/backend/.env with your real MONGO_URI first (see .env.example)"; exit 1
fi

echo "==> Installing Nginx, curl, envsubst"
sudo apt-get update -y
sudo apt-get install -y nginx curl gettext-base

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "==> Installing Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> Installing app dependencies"
cd "$APP/backend" && npm install --omit=dev

echo "==> systemd service"
sudo cp "$APP/deploy/taskboard-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now taskboard-api
sudo systemctl restart taskboard-api

echo "==> Nginx reverse proxy (port 80 -> 127.0.0.1:5000)"
API_UPSTREAM=127.0.0.1:5000 DNS_RESOLVER=169.254.169.253 \
  envsubst '${API_UPSTREAM} ${DNS_RESOLVER}' < "$APP/nginx/backend.conf.template" \
  | sudo tee /etc/nginx/sites-available/taskboard >/dev/null
sudo ln -sf /etc/nginx/sites-available/taskboard /etc/nginx/sites-enabled/taskboard
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

sleep 3
echo "==> Health check"
curl -s http://localhost/api/health; echo
