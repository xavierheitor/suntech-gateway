import { parsePacket } from './parse-packet.js';

const listEl = document.getElementById('connection-list');
const emptyState = document.getElementById('empty-state');
const deviceView = document.getElementById('device-view');
const wsStatus = document.getElementById('ws-status');
const linkConsole = document.getElementById('link-console');

const el = {
  title: document.getElementById('dev-title'),
  esn: document.getElementById('dev-esn'),
  status: document.getElementById('dev-status'),
  ip: document.getElementById('dev-ip'),
  port: document.getElementById('dev-port'),
  uptime: document.getElementById('dev-uptime'),
  last: document.getElementById('dev-last'),
  inCount: document.getElementById('dev-in'),
  outCount: document.getElementById('dev-out'),
  protocol: document.getElementById('trk-protocol'),
  timestamp: document.getElementById('trk-timestamp'),
  latitude: document.getElementById('trk-latitude'),
  longitude: document.getElementById('trk-longitude'),
  speed: document.getElementById('trk-speed'),
  heading: document.getElementById('trk-heading'),
  battery: document.getElementById('trk-battery'),
  satellites: document.getElementById('trk-satellites'),
};

/** @type {Map<string, any>} */
const connections = new Map();
/** @type {string | null} */
let selectedId = null;
let inCount = 0;
let outCount = 0;
let uptimeTimer = null;

const params = new URLSearchParams(location.search);
const initialId = params.get('id');

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function labelOf(conn) {
  return conn.esn || conn.id.slice(0, 8);
}

function isOnline(conn) {
  return conn.status === 'CONNECTED';
}

function display(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function upsertConnection(conn) {
  connections.set(conn.id, conn);
  renderList();
  if (selectedId === conn.id) renderConnection(conn);
}

function renderList() {
  const items = [...connections.values()].sort((a, b) => {
    const ao = isOnline(a) ? 0 : 1;
    const bo = isOnline(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return String(b.connectedAt).localeCompare(String(a.connectedAt));
  });

  if (!items.length) {
    listEl.innerHTML = `<p class="sub" style="padding:0.75rem;color:var(--muted)">Nenhuma conexão.</p>`;
    return;
  }

  listEl.innerHTML = items.map((c) => {
    const online = isOnline(c);
    const active = c.id === selectedId ? 'active' : '';
    return `
      <button type="button" class="conn-item ${active}" data-id="${c.id}">
        <div class="row">
          <span class="esn">[${escapeHtml(labelOf(c))}]</span>
          <span class="badge ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
        </div>
        <div class="sub">${escapeHtml(c.remoteIp)}:${c.remotePort}</div>
      </button>
    `;
  }).join('');
}

function updateUptime(conn) {
  if (!conn) {
    el.uptime.textContent = '—';
    return;
  }
  const end = isOnline(conn) ? Date.now() : Date.parse(conn.disconnectedAt || conn.connectedAt);
  const start = Date.parse(conn.connectedAt);
  el.uptime.textContent = formatDuration(end - start);
}

function renderConnection(conn) {
  el.title.textContent = labelOf(conn);
  el.esn.textContent = conn.esn || '—';
  el.status.textContent = isOnline(conn) ? 'Online' : 'Offline';
  el.status.style.color = isOnline(conn) ? 'var(--ok)' : 'var(--offline)';
  el.ip.textContent = conn.remoteIp || '—';
  el.port.textContent = String(conn.remotePort ?? '—');
  el.last.textContent = conn.lastMessage || '—';
  el.inCount.textContent = String(inCount);
  el.outCount.textContent = String(outCount);
  updateUptime(conn);
  linkConsole.href = `/console?id=${encodeURIComponent(conn.id)}`;
}

function renderTracker(parsed) {
  el.protocol.textContent = display(parsed?.protocol);
  el.timestamp.textContent = display(parsed?.timestamp);
  el.latitude.textContent = parsed?.latitude == null ? '—' : String(parsed.latitude);
  el.longitude.textContent = parsed?.longitude == null ? '—' : String(parsed.longitude);
  el.speed.textContent = parsed?.speed == null ? '—' : `${parsed.speed} km/h`;
  el.heading.textContent = parsed?.heading == null ? '—' : `${parsed.heading}°`;
  el.battery.textContent = parsed?.battery == null ? '—' : `${parsed.battery} V`;
  el.satellites.textContent = parsed?.satellites == null ? '—' : String(parsed.satellites);
}

function applyIncomingRaw(rawMessage) {
  const parsed = parsePacket(rawMessage);
  if (parsed.protocol === 'STT' || parsed.protocol === 'ALT') {
    renderTracker(parsed);
  }
}

async function selectConnection(id) {
  selectedId = id;
  emptyState.classList.add('hidden');
  deviceView.classList.remove('hidden');
  history.replaceState(null, '', `/device?id=${encodeURIComponent(id)}`);

  const detail = await api(`/connections/${id}`);
  upsertConnection(detail);

  const historyMessages = await api(`/connections/${id}/history?limit=2000`);
  inCount = historyMessages.filter((m) => m.direction === 'IN').length;
  outCount = historyMessages.filter((m) => m.direction === 'OUT').length;
  renderConnection(detail);

  const lastSttAlt = [...historyMessages]
    .reverse()
    .find((m) => m.direction === 'IN' && (m.protocol === 'STT' || m.protocol === 'ALT'));

  if (lastSttAlt) applyIncomingRaw(lastSttAlt.rawMessage);
  else renderTracker(null);

  if (uptimeTimer) clearInterval(uptimeTimer);
  uptimeTimer = setInterval(() => {
    const conn = connections.get(selectedId);
    if (conn) updateUptime(conn);
  }, 1000);
}

async function refreshList() {
  const list = await api('/connections?limit=500');
  connections.clear();
  for (const conn of list) connections.set(conn.id, conn);
  renderList();
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener('open', () => {
    wsStatus.textContent = 'WS online';
    wsStatus.classList.add('online');
    wsStatus.classList.remove('offline');
  });

  ws.addEventListener('close', () => {
    wsStatus.textContent = 'WS offline — reconectando…';
    wsStatus.classList.remove('online');
    wsStatus.classList.add('offline');
    setTimeout(connectWs, 1500);
  });

  ws.addEventListener('message', (ev) => {
    let packet;
    try { packet = JSON.parse(ev.data); } catch { return; }
    const { event, payload } = packet;

    if (event === 'connection.created' || event === 'connection.updated' || event === 'connection.closed') {
      upsertConnection(payload.connection);
      return;
    }

    if (event === 'message.received' || event === 'message.sent') {
      if (payload.connection) upsertConnection(payload.connection);
      if (!selectedId || payload.message?.connectionId !== selectedId) return;

      if (event === 'message.received') inCount += 1;
      if (event === 'message.sent') outCount += 1;

      const conn = connections.get(selectedId);
      if (conn && payload.message?.rawMessage) {
        conn.lastMessage = payload.message.rawMessage;
      }
      if (conn) renderConnection(conn);

      if (event === 'message.received' && payload.message?.rawMessage) {
        applyIncomingRaw(payload.message.rawMessage);
      }
    }
  });
}

listEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-id]');
  if (!btn) return;
  selectConnection(btn.dataset.id).catch((err) => alert(err.message));
});

document.getElementById('btn-refresh-list').addEventListener('click', () => {
  refreshList().catch((err) => alert(err.message));
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  if (selectedId) selectConnection(selectedId).catch((err) => alert(err.message));
});

refreshList()
  .then(() => {
    if (initialId) return selectConnection(initialId);
  })
  .catch((err) => {
    listEl.innerHTML = `<p class="sub" style="padding:0.75rem;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  });

connectWs();
