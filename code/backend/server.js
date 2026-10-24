// =====================================================================
//  DevOps Task Board - Backend API
//  Node.js + Express + Mongoose (MongoDB)
//
//  Request path on AWS:
//  Browser -> Frontend ALB -> Nginx (frontend EC2) -> Backend ALB
//          -> Nginx (backend EC2, port 80) -> THIS APP (port 5000) -> MongoDB Atlas
// =====================================================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Task, TAGS } = require('./models/Task');
const { detectInstance } = require('./lib/instance');
const { startStress, stressStatus } = require('./lib/stress');

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;
const APP_ENV = process.env.APP_ENV || 'dev';
const ENABLE_STRESS = process.env.ENABLE_STRESS === 'true';
const SERVE_FRONTEND = process.env.SERVE_FRONTEND === 'true';
const startedAt = Date.now();

let instance = { instanceId: 'detecting...', az: '-', privateIp: '-', source: '-' };

const app = express();
app.disable('x-powered-by'); // don't advertise the framework to attackers
app.use(express.json({ limit: '10kb' }));

// Tell every response which backend server answered it.
// You can see this header in the browser DevTools -> Network tab.
app.use((req, res, next) => {
  res.set('X-Backend-Instance', instance.instanceId);
  next();
});

// Simple request log -> visible with: sudo journalctl -u taskboard-api -f
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health') {
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`);
    }
  });
  next();
});

const dbState = () => ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';

// ---------------------------------------------------------------------
// Health check - used by the Backend ALB Target Group.
// Returns 200 only when the app AND the database connection are OK.
// If it returns 503, the ALB stops sending traffic to this instance,
// and the Auto Scaling Group can replace it.
// ---------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', db: dbState(), instanceId: instance.instanceId });
});

// Which server am I talking to? (used by the Infrastructure panel + live LB view)
app.get('/api/info', (req, res) => {
  res.json({
    ...instance,
    env: APP_ENV,
    node: process.version,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    db: dbState(),
    dbHost: mongoose.connection.host || null,
    stress: { enabled: ENABLE_STRESS, ...stressStatus() },
    servedAt: new Date().toISOString(),
  });
});

// ---------------------------- Tasks CRUD -----------------------------
const requireDb = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected. Check MONGO_URI and Atlas Network Access.' });
  }
  next();
};

app.get('/api/tags', (req, res) => res.json(TAGS));

app.get('/api/tasks', requireDb, async (req, res, next) => {
  try {
    const tasks = await Task.find().sort({ done: 1, createdAt: -1 }).limit(200);
    res.json(tasks);
  } catch (e) { next(e); }
});

app.post('/api/tasks', requireDb, async (req, res, next) => {
  try {
    const { title, tag } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
    const task = await Task.create({ title, tag, createdOn: instance.instanceId });
    res.status(201).json(task);
  } catch (e) { next(e); }
});

app.patch('/api/tasks/:id', requireDb, async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.done === 'boolean') update.done = req.body.done;
    if (req.body.title) update.title = req.body.title;
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.json(task);
  } catch (e) { next(e); }
});

app.delete('/api/tasks/:id', requireDb, async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ----------------------- Auto Scaling demo ---------------------------
app.post('/api/stress', (req, res) => {
  if (!ENABLE_STRESS) return res.status(403).json({ error: 'Stress endpoint disabled. Set ENABLE_STRESS=true in .env' });
  res.json({ instanceId: instance.instanceId, ...startStress(req.query.seconds) });
});

// --------- Laptop mode only: let Node serve the frontend too ---------
if (SERVE_FRONTEND) {
  const fe = path.join(__dirname, '..', 'frontend');
  app.get('/instance.json', (req, res) =>
    res.json({ instanceId: `local-frontend (${instance.hostname || 'laptop'})`, az: 'local', privateIp: instance.privateIp, mode: 'laptop', server: 'Node.js static files (laptop mode)' })
  );
  app.use(express.static(fe));
  console.log(`SERVE_FRONTEND=true -> serving frontend from ${fe}`);
}

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'CastError') return res.status(400).json({ error: 'invalid id' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'internal server error' });
});

// --------------------------- MongoDB ---------------------------------
// Hide the password when we print the connection string in logs
const maskUri = (uri) => uri.replace(/\/\/([^:/]+):([^@]+)@/, '//$1:****@');

async function connectWithRetry() {
  if (!MONGO_URI || MONGO_URI.includes('<db_password>')) {
    console.error('MONGO_URI is missing or still has placeholders. Edit backend/.env');
    return;
  }
  console.log(`Connecting to MongoDB: ${maskUri(MONGO_URI)}`);
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log(`MongoDB connected -> host: ${mongoose.connection.host}, db: ${mongoose.connection.name}`);
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    console.error('Common causes: wrong password, IP not allowed in Atlas Network Access, no outbound internet (NAT).');
    console.log('Retrying in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
}
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

// ---------------------------- Start ----------------------------------
(async () => {
  instance = await detectInstance();
  console.log(`Running on: ${instance.instanceId} (${instance.az}, ${instance.privateIp}) [${instance.source}]`);
  app.listen(PORT, () => console.log(`Task Board API listening on port ${PORT}`));
  connectWithRetry();
})();

// Graceful shutdown: when the ASG terminates an instance, systemd sends SIGTERM
process.on('SIGTERM', async () => {
  console.log('SIGTERM received - closing MongoDB connection');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});
