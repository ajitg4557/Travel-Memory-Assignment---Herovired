// CPU stress generator for the Auto Scaling demo.
//
// It starts one worker thread per vCPU and keeps them busy for N seconds.
// Worker threads are used so the main Node.js event loop stays free -
// the API and the /api/health check keep answering while the CPU is at ~100%.
// (If health checks failed, the load balancer would mark the instance unhealthy
//  and the ASG would replace it - that is a different demo!)
const os = require('os');
const { Worker } = require('worker_threads');

let busyUntil = 0;

const workerCode = `
  const { workerData } = require('worker_threads');
  const end = Date.now() + workerData.ms;
  let x = 0;
  while (Date.now() < end) { x += Math.sqrt(Math.random() * 1e6); }
`;

function startStress(seconds) {
  const ms = Math.min(Math.max(Number(seconds) || 60, 10), 600) * 1000;
  const now = Date.now();
  if (busyUntil > now) {
    return { started: false, message: 'Stress already running', secondsLeft: Math.round((busyUntil - now) / 1000) };
  }
  const cpus = os.cpus().length;
  busyUntil = now + ms;
  for (let i = 0; i < cpus; i++) {
    const w = new Worker(workerCode, { eval: true, workerData: { ms } });
    w.on('error', (err) => console.error('stress worker error', err.message));
  }
  return { started: true, cpus, seconds: ms / 1000 };
}

function stressStatus() {
  const left = Math.max(0, Math.round((busyUntil - Date.now()) / 1000));
  return { running: left > 0, secondsLeft: left, loadAvg: os.loadavg().map((n) => n.toFixed(2)) };
}

module.exports = { startStress, stressStatus };
