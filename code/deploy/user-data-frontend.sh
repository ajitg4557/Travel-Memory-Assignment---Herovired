#!/bin/bash
# =====================================================================
#  LAUNCH TEMPLATE USER DATA - FRONTEND
#
#  Paste this into: Launch template -> Advanced details -> User data
#  It runs ONCE, as root, on the first boot of every instance the ASG launches.
#
#  The AMI already contains Nginx, the frontend files and taskboard-meta.service.
#  User data only does what must be different per environment:
#  it points Nginx at the Backend ALB.
#
#  >>> CHANGE THIS: Backend ALB DNS name (EC2 -> Load Balancers -> taskboard-be-alb)
#      example: internal-taskboard-be-alb-123456789.ap-south-1.elb.amazonaws.com
# =====================================================================
BACKEND_HOST="internal-taskboard-be-alb-1234567890.ap-south-1.elb.amazonaws.com"

set -euxo pipefail
exec > >(tee -a /var/log/taskboard-user-data.log) 2>&1   # log for debugging

cd /opt/taskboard
BACKEND_HOST="$BACKEND_HOST" DNS_RESOLVER="169.254.169.253" \
  envsubst '${BACKEND_HOST} ${DNS_RESOLVER}' \
  < nginx/frontend.conf.template > /etc/nginx/sites-available/taskboard

ln -sf /etc/nginx/sites-available/taskboard /etc/nginx/sites-enabled/taskboard
rm -f /etc/nginx/sites-enabled/default

nginx -t                                   # stop here if the config is broken
systemctl restart taskboard-meta           # write this instance's instance.json
systemctl restart nginx
echo "Frontend ready -> /api goes to $BACKEND_HOST"
