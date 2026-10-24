// Finds out "who am I?" - which EC2 instance this code is running on.
//
// On EC2 we ask the Instance Metadata Service (IMDSv2) at 169.254.169.254.
// This special IP is only reachable from inside an EC2 instance.
// On a laptop / Docker the call fails quickly and we fall back to the hostname.
const os = require('os');

const IMDS = 'http://169.254.169.254/latest';

async function imdsGet(path, token) {
  const res = await fetch(`${IMDS}/meta-data/${path}`, {
    headers: { 'X-aws-ec2-metadata-token': token },
    signal: AbortSignal.timeout(1000),
  });
  if (!res.ok) throw new Error(`IMDS ${path} -> ${res.status}`);
  return res.text();
}

function localIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

async function detectInstance() {
  try {
    // IMDSv2: first get a session token (PUT), then use it for every read (GET)
    const tokenRes = await fetch(`${IMDS}/api/token`, {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      signal: AbortSignal.timeout(1000),
    });
    if (!tokenRes.ok) throw new Error('no IMDS token');
    const token = await tokenRes.text();
    const [instanceId, az, privateIp, instanceType] = await Promise.all([
      imdsGet('instance-id', token),
      imdsGet('placement/availability-zone', token),
      imdsGet('local-ipv4', token),
      imdsGet('instance-type', token),
    ]);
    return { source: 'ec2', instanceId, az, privateIp, instanceType, hostname: os.hostname() };
  } catch {
    return {
      source: 'local',
      instanceId: os.hostname(),
      az: 'local',
      privateIp: localIp(),
      instanceType: 'laptop / container',
      hostname: os.hostname(),
    };
  }
}

module.exports = { detectInstance };
