const listEl = document.getElementById('connection-list');
const emptyState = document.getElementById('empty-state');
const consoleView = document.getElementById('console-view');
const terminal = document.getElementById('terminal');
const input = document.getElementById('command-input');
const wsStatus = document.getElementById('ws-status');
const appendTerminatorEl = document.getElementById('append-terminator');

const meta = {
  esn: document.getElementById('meta-esn'),
  ip: document.getElementById('meta-ip'),
  port: document.getElementById('meta-port'),
  uptime: document.getElementById('meta-uptime'),
  status: document.getElementById('meta-status'),
};

/** @type {Map<string, any>} */
const connections = new Map();
/** @type {string | null} */
let selectedId = null;
/** IDs limpos apenas na tela local (não apaga histórico no servidor). */
const clearedLocally = new Set();
/** @type {Set<string>} */
const renderedMessageIds = new Set();
let uptimeTimer = null;

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

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour12: false });
  } catch {
    return iso;
  }
}

function labelOf(conn) {
  return conn.esn || conn.id.slice(0, 8);
}

function isOnline(conn) {
  return conn.status === 'CONNECTED';
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
  if (selectedId === conn.id) renderMeta(conn);
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
    const last = c.lastMessage
      ? escapeHtml(c.lastMessage.length > 42 ? `${c.lastMessage.slice(0, 42)}…` : c.lastMessage)
      : 'sem mensagens';
    return `
      <button type="button" class="conn-item ${active}" data-id="${c.id}">
        <div class="row">
          <span class="esn">[${escapeHtml(labelOf(c))}]</span>
          <span class="badge ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
        </div>
        <div class="sub">${escapeHtml(c.remoteIp)}:${c.remotePort}<br/>${last}</div>
      </button>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderMeta(conn) {
  meta.esn.textContent = conn.esn || '—';
  meta.ip.textContent = conn.remoteIp || '—';
  meta.port.textContent = String(conn.remotePort ?? '—');
  meta.status.textContent = isOnline(conn) ? 'Conectado' : 'Desconectado';
  meta.status.style.color = isOnline(conn) ? 'var(--ok)' : 'var(--offline)';
  updateUptime(conn);
  document.getElementById('btn-disconnect').disabled = !isOnline(conn);
  document.getElementById('btn-send').disabled = !isOnline(conn);
}

function updateUptime(conn) {
  if (!conn) {
    meta.uptime.textContent = '—';
    return;
  }
  const end = isOnline(conn) ? Date.now() : Date.parse(conn.disconnectedAt || conn.connectedAt);
  const start = Date.parse(conn.connectedAt);
  meta.uptime.textContent = formatDuration(end - start);
}

function appendMessage(message, { scroll = true } = {}) {
  if (!message || renderedMessageIds.has(message.id)) return;
  if (clearedLocally.has(message.connectionId) && selectedId === message.connectionId) {
    // após limpar tela, ainda mostramos mensagens novas em tempo real
  }
  renderedMessageIds.add(message.id);

  const dir = message.direction === 'OUT' ? 'out' : 'in';
  const arrow = dir === 'out' ? '->' : '<-';
  const el = document.createElement('div');
  el.className = `msg ${dir}`;
  el.dataset.id = message.id;
  el.innerHTML = `
    <span class="time">${escapeHtml(formatTime(message.timestamp))}</span>
    <span class="dir">${arrow}</span>
    <span class="body"><span class="proto">${escapeHtml(message.protocol || '')}</span>${escapeHtml(message.rawMessage)}</span>
  `;
  terminal.appendChild(el);
  if (scroll) terminal.scrollTop = terminal.scrollHeight;
}

function clearScreenLocal() {
  terminal.innerHTML = '';
  renderedMessageIds.clear();
  if (selectedId) clearedLocally.add(selectedId);
}

async function selectConnection(id) {
  selectedId = id;
  clearedLocally.delete(id);
  renderedMessageIds.clear();
  terminal.innerHTML = '';
  emptyState.classList.add('hidden');
  consoleView.classList.remove('hidden');
  renderList();

  const detail = await api(`/connections/${id}`);
  upsertConnection(detail);
  renderMeta(detail);

  const history = await api(`/connections/${id}/history?limit=1000`);
  for (const message of history) appendMessage(message, { scroll: false });
  terminal.scrollTop = terminal.scrollHeight;

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
  if (selectedId && connections.has(selectedId)) {
    renderMeta(connections.get(selectedId));
  }
}

async function refreshSelected() {
  if (!selectedId) return;
  await selectConnection(selectedId);
}

async function sendCommand() {
  if (!selectedId) return;
  const text = input.value;
  if (!text.length) return;

  const appendTerminator = appendTerminatorEl.checked;
  await api(`/connections/${selectedId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text, appendTerminator }),
  });
  // mensagem OUT chega via WebSocket (message.sent); não limpamos o texto digitado
}

async function disconnectSelected() {
  if (!selectedId) return;
  if (!confirm('Desconectar este socket TCP?')) return;
  await api(`/connections/${selectedId}/disconnect`, { method: 'POST' });
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
      if (selectedId && payload.message?.connectionId === selectedId) {
        appendMessage(payload.message, { scroll: true });
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
  refreshSelected().catch((err) => alert(err.message));
});
document.getElementById('btn-clear').addEventListener('click', clearScreenLocal);
document.getElementById('btn-disconnect').addEventListener('click', () => {
  disconnectSelected().catch((err) => alert(err.message));
});
document.getElementById('btn-send').addEventListener('click', () => {
  sendCommand().catch((err) => alert(err.message));
});

input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    sendCommand().catch((err) => alert(err.message));
  }
});

refreshList().catch((err) => {
  listEl.innerHTML = `<p class="sub" style="padding:0.75rem;color:var(--danger)">${escapeHtml(err.message)}</p>`;
});
connectWs();
