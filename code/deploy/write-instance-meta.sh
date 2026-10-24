#!/bin/bash
# ---------------------------------------------------------------------
# Writes /var/www/meta/instance.json with THIS instance's details.
# Run at every boot by taskboard-meta.service on the FRONTEND instances.
#
# WHY at every boot? When you create an AMI, the file inside it still holds the
# OLD instance's ID. Every new instance launched from that AMI must write its own.
# ---------------------------------------------------------------------
set -euo pipefail
OUT_DIR=/var/www/meta
mkdir -p "$OUT_DIR"

IMDS=http://169.254.169.254/latest
# IMDSv2: get a session token first, then read metadata with it
TOKEN=$(curl -sf -m 2 -X PUT "$IMDS/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300" || true)

md() { curl -sf -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" "$IMDS/meta-data/$1" || echo "unknown"; }

if [ -n "$TOKEN" ]; then
  ID=$(md instance-id); AZ=$(md placement/availability-zone); IP=$(md local-ipv4); TYPE=$(md instance-type); MODE=aws
else
  ID=$(hostname); AZ=local; IP=$(hostname -I | awk '{print $1}'); TYPE=unknown; MODE=local
fi

cat > "$OUT_DIR/instance.json" <<EOF
{
  "instanceId": "$ID",
  "az": "$AZ",
  "privateIp": "$IP",
  "instanceType": "$TYPE",
  "mode": "$MODE",
  "server": "Nginx",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chmod 644 "$OUT_DIR/instance.json"
echo "instance.json written for $ID ($AZ, $IP)"
