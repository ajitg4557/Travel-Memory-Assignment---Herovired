#!/bin/bash
# =====================================================================
#  OPTIONAL shortcut: sets up the FIRST frontend EC2 instance in one go.
#  The guide does the same thing step by step (recommended the first time).
#
#  Usage (on the frontend EC2, as the ubuntu user):
#     sudo git clone https://github.com/<YOUR_GITHUB_USERNAME>/devops-task-board.git /opt/taskboard
#     bash /opt/taskboard/deploy/setup-frontend.sh <BACKEND_PRIVATE_IP>
#  Later (after creating the Backend ALB) re-run it with the ALB DNS name:
#     bash /opt/taskboard/deploy/setup-frontend.sh <BACKEND_ALB_DNS>
# =====================================================================
set -euo pipefail
APP=/opt/taskboard
BACKEND_HOST="${1:-}"
if [ -z "$BACKEND_HOST" ]; then echo "Usage: $0 <BACKEND_PRIVATE_IP or BACKEND_ALB_DNS>"; exit 1; fi

echo "==> Installing Nginx, curl, envsubst"
sudo apt-get update -y
sudo apt-get install -y nginx curl gettext-base

echo "==> Copying frontend files to /var/www/taskboard"
sudo mkdir -p /var/www/taskboard
sudo cp -r "$APP/frontend/." /var/www/taskboard/

echo "==> instance.json generator (runs at every boot)"
sudo cp "$APP/deploy/taskboard-meta.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable taskboard-meta
sudo systemctl restart taskboard-meta

echo "==> Nginx: static files + /api reverse proxy -> $BACKEND_HOST"
BACKEND_HOST="$BACKEND_HOST" DNS_RESOLVER=169.254.169.253 \
  envsubst '${BACKEND_HOST} ${DNS_RESOLVER}' < "$APP/nginx/frontend.conf.template" \
  | sudo tee /etc/nginx/sites-available/taskboard >/dev/null
sudo ln -sf /etc/nginx/sites-available/taskboard /etc/nginx/sites-enabled/taskboard
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo "==> Tests"
curl -s http://localhost/health
curl -s http://localhost/api/health; echo
