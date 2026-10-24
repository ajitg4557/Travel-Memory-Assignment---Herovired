#!/bin/sh
# Docker Compose only: writes instance.json for the frontend Nginx container
mkdir -p /var/www/meta
cat > /var/www/meta/instance.json <<EOF
{
  "instanceId": "container-$(hostname)",
  "az": "docker",
  "privateIp": "$(hostname -i 2>/dev/null | awk '{print $1}')",
  "mode": "docker",
  "server": "Nginx (container)"
}
EOF
