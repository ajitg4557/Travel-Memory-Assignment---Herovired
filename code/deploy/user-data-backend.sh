#!/bin/bash
# =====================================================================
#  LAUNCH TEMPLATE USER DATA - BACKEND
#
#  Paste this into: Launch template -> Advanced details -> User data
#  It runs ONCE, as root, on the first boot of every instance the ASG launches.
#
#  The backend AMI already contains Node.js, the code, backend/.env (MONGO_URI),
#  the systemd service and Nginx, all enabled to start at boot.
#  So user data only restarts services and runs a self-test for the log.
#
#  Production note: instead of baking MONGO_URI into the AMI you would fetch it
#  here from AWS Secrets Manager or SSM Parameter Store using an IAM role.
# =====================================================================
set -euxo pipefail
exec > >(tee -a /var/log/taskboard-user-data.log) 2>&1

systemctl restart taskboard-api
systemctl restart nginx

# Self-test: wait up to 30s for the API + MongoDB to be healthy
for i in $(seq 1 15); do
  if curl -sf http://localhost/api/health; then echo; echo "Backend healthy"; exit 0; fi
  sleep 2
done
echo "WARNING: backend not healthy yet - check: journalctl -u taskboard-api -n 50"
