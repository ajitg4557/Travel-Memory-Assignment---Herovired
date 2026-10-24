// =====================================================================
// DevOps Task Board - frontend logic (plain JavaScript, no build step)
//
// IMPORTANT: every API call uses a RELATIVE url like "/api/tasks".
// The browser sends it to the same server that served this page (Nginx).
// Nginx then forwards /api/* to the backend. Because of that:
//   - the backend address is never hard-coded in this file
//   - there is no CORS problem (browser only talks to one origin)
// =====================================================================

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortTime = (d) => new Date(d).toLocaleTimeString();

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store', ...opts });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `${res.status} ${res.statusText}`);
  return { body, headers: res.headers };
}

// ------------------- Frontend + backend identity -------------------
async function getFrontend() {
  const { body, headers } = await api(`/instance.json?t=${Date.now()}`);
  return {
    ...body,
    viaFeAlb: !!headers.get('X-FE-ALB'),
    feNginx: headers.get('X-Frontend-Nginx'),
  };
}
async function getBackend() {
  const { body, headers } = await api(`/api/info?t=${Date.now()}`);
  return {
    ...body,
    backendTarget: headers.get('X-Backend-Target'),
    beNginx: headers.get('X-Backend-Nginx'),
  };
}

function renderDl(el, rows) {
  el.innerHTML = rows.map(([k, v, big]) => `<dt>${esc(k)}</dt><dd class="${big ? 'big' : ''}">${esc(v)}</dd>`).join('');
  el.closest('.card').classList.remove('flash');
  void el.offsetWidth;
  el.closest('.card').classList.add('flash');
}

function renderFlow(fe, be) {
  const on = {
    browser: true,
    fealb: fe && fe.viaFeAlb,
    fenginx: fe && !!fe.feNginx,
    bealb: be && be.backendTarget && be.backendTarget.includes('elb.amazonaws.com'),
    benginx: be && !!be.beNginx,
    node: !!be,
    mongo: be && be.db === 'connected',
  };
  document.querySelectorAll('#flow li').forEach((li) => {
    li.classList.toggle('on', !!on[li.dataset.k]);
    li.classList.toggle('skip', !on[li.dataset.k]);
  });
  let hint;
  if (on.fealb && on.bealb) hint = 'Full AWS setup: both load balancers are in the path.';
  else if (fe && fe.mode === 'aws') hint = 'Running on EC2. Hops that are crossed out are not set up yet (for example, the ALBs in phase 1).';
  else if (fe && fe.mode === 'docker') hint = 'Running in Docker Compose on your laptop. Docker DNS plays the role of the load balancer here.';
  else if (on.fenginx) hint = 'Nginx serves the page and proxies /api to the backend. No ALBs in front yet.';
  else hint = 'Laptop mode: Node.js serves both the page and the API. Nginx and the ALBs come later on AWS.';
  const mongoLi = document.querySelector('#flow li[data-k="mongo"] small');
  if (mongoLi && be && be.dbHost) mongoLi.textContent = be.dbHost.includes('mongodb.net') ? 'Atlas' : 'local / container';
  $('flowHint').textContent = hint;
}

async function loadInfo() {
  let fe = null, be = null;
  try {
    fe = await getFrontend();
    renderDl($('feInfo'), [
      ['Instance', fe.instanceId, true],
      ['AZ', fe.az],
      ['Private IP', fe.privateIp],
      ['Served by', fe.feNginx ? `Nginx on ${fe.feNginx}` : fe.server || '-'],
      ['Via ALB', fe.viaFeAlb ? 'yes (X-Amzn-Trace-Id seen)' : 'no (direct)'],
    ]);
  } catch (e) {
    renderDl($('feInfo'), [['Error', e.message]]);
  }
  try {
    be = await getBackend();
    renderDl($('beInfo'), [
      ['Instance', be.instanceId, true],
      ['AZ', be.az],
      ['Private IP', be.privateIp],
      ['Nginx -> /api', be.backendTarget || '(no frontend Nginx)'],
      ['Backend Nginx', be.beNginx || '(not in path)'],
      ['Uptime', `${be.uptimeSec}s  |  Node ${be.node}`],
      ['Database', `${be.db}${be.dbHost ? '  @ ' + be.dbHost : ''}`],
    ]);
    $('envPill').textContent = `env: ${be.env}`;
    $('dbPill').textContent = `db: ${be.db}`;
    $('dbPill').className = `pill ${be.db === 'connected' ? 'ok' : 'bad'}`;
  } catch (e) {
    renderDl($('beInfo'), [['Error', e.message], ['Tip', 'Is the backend running? Check Nginx proxy_pass and security groups.']]);
    $('dbPill').textContent = 'db: unknown';
    $('dbPill').className = 'pill bad';
  }
  renderFlow(fe, be);
}

// ------------------------------- Tasks ------------------------------
async function loadTags() {
  try {
    const { body } = await api('/api/tags');
    $('taskTag').innerHTML = body.map((t) => `<option>${esc(t)}</option>`).join('');
  } catch {
    $('taskTag').innerHTML = '<option>Other</option>';
  }
}

async function loadTasks() {
  try {
    const { body: tasks } = await api('/api/tasks');
    $('taskError').hidden = true;
    const done = tasks.filter((t) => t.done).length;
    $('taskCount').textContent = `${done}/${tasks.length} done`;
    $('taskList').innerHTML = tasks.length
      ? tasks.map((t) => `
        <li class="${t.done ? 'done' : ''}" data-id="${t._id}">
          <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="mark done" />
          <div><div class="title">${esc(t.title)}</div>
               <div class="meta">created on ${esc(t.createdOn)} &middot; ${shortTime(t.createdAt)}</div></div>
          <span class="ttag">${esc(t.tag)}</span>
          <button class="del" title="delete" aria-label="delete">&times;</button>
        </li>`).join('')
      : '<li class="empty">No tasks yet. Add your first one above.</li>';
  } catch (e) {
    showTaskError(e.message);
  }
}

function showTaskError(msg) {
  $('taskError').textContent = msg;
  $('taskError').hidden = false;
}

$('taskForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const title = $('taskTitle').value.trim();
  if (!title) return showTaskError('Enter a task title first');
  try {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, tag: $('taskTag').value }) });
    $('taskTitle').value = '';
    loadTasks();
  } catch (e) { showTaskError(e.message); }
});
$('taskTitle').addEventListener('input', () => { $('taskError').hidden = true; });

$('taskList').addEventListener('click', async (ev) => {
  const li = ev.target.closest('li[data-id]');
  if (!li) return;
  try {
    if (ev.target.matches('input[type=checkbox]')) {
      await api(`/api/tasks/${li.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ done: ev.target.checked }) });
      loadTasks();
    } else if (ev.target.matches('.del')) {
      await api(`/api/tasks/${li.dataset.id}`, { method: 'DELETE' });
      loadTasks();
    }
  } catch (e) { showTaskError(e.message); }
});

// --------------------- Live load-balancing view ---------------------
const seen = { fe: new Map(), be: new Map() };
const startedAt = { t: 0 };
let timer = null, errors = 0;

function record(kind, data) {
  const m = seen[kind];
  const key = data.instanceId;
  const row = m.get(key) || { id: key, az: data.az, hits: 0, first: Date.now() };
  row.hits++;
  row.last = Date.now();
  m.set(key, row);
}

function renderTable(kind, tbodyId, totalId) {
  const rows = [...seen[kind].values()].sort((a, b) => a.first - b.first);
  const total = rows.reduce((s, r) => s + r.hits, 0);
  $(totalId).textContent = rows.length ? `(${rows.length} seen, ${total} requests)` : '';
  $(tbodyId).innerHTML = rows.length
    ? rows.map((r) => {
        const isNew = r.first - startedAt.t > 5000 && Date.now() - r.first < 60000;
        const stale = Date.now() - r.last > 15000;
        const pct = total ? Math.round((r.hits / total) * 100) : 0;
        return `<tr class="${isNew ? 'fresh' : ''}" style="${stale ? 'opacity:.45' : ''}">
          <td>${esc(r.id)}${isNew ? '<span class="new">NEW</span>' : ''}</td>
          <td>${esc(r.az)}</td><td>${r.hits}</td>
          <td><div class="bar"><span style="width:${pct}%"></span></div></td>
          <td>${stale ? 'gone? ' : ''}${shortTime(r.last)}</td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="muted">Waiting...</td></tr>';
}

async function tick() {
  await Promise.all([
    getFrontend().then((d) => record('fe', d)).catch(() => errors++),
    getBackend().then((d) => record('be', d)).catch(() => errors++),
  ]);
  renderTable('fe', 'feTable', 'feTotal');
  renderTable('be', 'beTable', 'beTotal');
  $('lbErrors').textContent = errors ? `${errors} failed requests (normal for a moment while an instance is draining or starting)` : '';
}

function startLb() {
  if (!startedAt.t) startedAt.t = Date.now();
  timer = setInterval(tick, Number($('lbInterval').value));
  tick();
  $('lbToggle').textContent = 'Stop';
}
function stopLb() {
  clearInterval(timer);
  timer = null;
  $('lbToggle').textContent = 'Start';
}
$('lbToggle').addEventListener('click', () => (timer ? stopLb() : startLb()));
$('lbInterval').addEventListener('change', () => { if (timer) { stopLb(); startLb(); } });
$('lbReset').addEventListener('click', () => {
  seen.fe.clear(); seen.be.clear(); errors = 0; startedAt.t = timer ? Date.now() : 0;
  renderTable('fe', 'feTable', 'feTotal'); renderTable('be', 'beTable', 'beTotal');
});

// ------------------------ Auto Scaling demo -------------------------
$('stressBtn').addEventListener('click', async () => {
  const secs = $('stressSecs').value;
  const n = Number($('stressReqs').value);
  const out = $('stressOut');
  $('stressBtn').disabled = true;
  out.innerHTML = `<li>Sending ${n} stress requests (${secs}s each)...</li>`;
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      api(`/api/stress?seconds=${secs}`, { method: 'POST' }).then((r) => r.body).catch((e) => ({ error: e.message }))
    )
  );
  const byInstance = {};
  results.forEach((r) => {
    if (r.error) return;
    byInstance[r.instanceId] = byInstance[r.instanceId] || { started: false, cpus: r.cpus, left: r.secondsLeft };
    if (r.started) byInstance[r.instanceId].started = true;
  });
  const failed = results.filter((r) => r.error);
  out.innerHTML =
    Object.entries(byInstance).map(([id, v]) =>
      `<li class="ok">&#10003; ${esc(id)}: CPU busy (${v.started ? `${secs}s on ${v.cpus} vCPU` : `already running, ${v.left}s left`})</li>`).join('') +
    (failed.length ? `<li class="bad">&#10007; ${failed.length} request(s) failed: ${esc(failed[0].error)}</li>` : '') +
    '<li>Next: open EC2 > Auto Scaling Groups > backend ASG > Activity. In about 3 to 5 minutes a new instance launches and appears in the live view.</li>';
  $('stressBtn').disabled = false;
});

// ------------------------------- Init -------------------------------
loadInfo();
loadTags();
loadTasks();
$('refreshInfo').addEventListener('click', () => { loadInfo(); loadTasks(); });
