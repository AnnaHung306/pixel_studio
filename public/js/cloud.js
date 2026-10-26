// Optional server integration: owner login, cloud projects, incremental sync and live WebSocket updates.
import { app, on, emit, toast, changed, uid, pushHistory } from './state.js';
import { bytesToB64, b64ToBytes } from './core/raster.js';
import { docToJSON, docFromJSON } from './storage.js';
import { isStroking } from './tools.js';

export const cloud = {
  available: false, token: localStorage.getItem('pxs-owner-token') || null, ws: null, status: 'off',
  clientId: uid('C'), synced: null, timer: null, queue: [], sending: false,
};

export async function detectServer() {
  try {
    if (navigator.onLine === false) throw new Error('offline'); // no request at all → no network error logged
    // On a plain static host (dist/ only) there is no /api: probe the app shell with HEAD first and look for the
    // server's marker header, so static hosting never logs a 404 for api/health.
    const head = await fetch('./', { method: 'HEAD', cache: 'no-store' });
    if (head.headers.get('x-pixel-studio') !== 'server') throw new Error('static host');
    const r = await fetch('api/health', { cache: 'no-store' });
    const j = await r.json();
    cloud.available = j.app === 'pixel-studio';
  } catch { cloud.available = false; }
  if (cloud.available && cloud.token) {
    const ok = await api('GET', 'api/auth/me').then(() => true).catch(() => false);
    if (!ok) { cloud.token = null; localStorage.removeItem('pxs-owner-token'); }
  }
  setStatus();
  return cloud.available;
}

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cloud.token ? { Authorization: 'Bearer ' + cloud.token } : {}), 'X-Client-Id': cloud.clientId },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = { raw: text }; }
  if (!r.ok) { const e = new Error(j?.error?.message || r.statusText); e.status = r.status; throw e; }
  return j;
}

export async function login(password) {
  const j = await api('POST', 'api/auth/login', { password });
  cloud.token = j.token;
  localStorage.setItem('pxs-owner-token', j.token);
  setStatus();
  if (app.doc?.cloud) connectWS();
}
export async function logout() {
  try { await api('POST', 'api/auth/logout'); } catch {}
  cloud.token = null;
  localStorage.removeItem('pxs-owner-token');
  cloud.ws?.close();
  setStatus();
}
export const loggedIn = () => cloud.available && !!cloud.token;

function setStatus(s) {
  if (s) cloud.status = s;
  else cloud.status = !cloud.available ? 'off' : !cloud.token ? 'nologin' : app.doc?.cloud ? (cloud.ws?.readyState === 1 ? 'live' : 'connecting') : 'ready';
  emit('cloud', cloud.status);
}

// ---------- synced snapshot ----------
const metaKey = (m) => JSON.stringify({ ...m, updatedAt: 0 });
function snapSynced() {
  cloud.synced = { meta: metaKey(app.doc.meta), cels: new Map(app.doc.cels), refs: new Map(app.doc.refs) };
}
function diff() {
  const s = cloud.synced;
  const patch = {};
  const metaStr = metaKey(app.doc.meta);
  if (metaStr !== s.meta) patch.meta = app.doc.meta;
  const cels = {};
  let nc = 0;
  for (const [k, v] of app.doc.cels) if (s.cels.get(k) !== v) { cels[k] = bytesToB64(v); nc++; }
  for (const k of s.cels.keys()) if (!app.doc.cels.has(k)) { cels[k] = null; nc++; }
  if (nc) patch.cels = cels;
  const refs = {};
  let nr = 0;
  for (const [k, v] of app.doc.refs) if (s.refs.get(k) !== v) { refs[k] = v; nr++; }
  for (const k of s.refs.keys()) if (!app.doc.refs.has(k)) { refs[k] = null; nr++; }
  if (nr) patch.refs = refs;
  return Object.keys(patch).length ? patch : null;
}

// ---------- open / upload ----------
export async function listCloudProjects() { return (await api('GET', 'api/owner/projects')).projects; }
export async function openCloudProject(id) {
  const obj = await api('GET', `api/owner/projects/${id}`);
  const doc = docFromJSON(obj);
  doc.cloud = true;
  doc.sync = { rev: obj.rev, at: Date.now() };
  return doc;
}
export async function uploadCurrent() {
  const obj = docToJSON(app.doc);
  const at = Date.now();
  let rev;
  try { rev = (await api('POST', 'api/owner/projects', obj)).rev; }
  catch (e) { if (e.status === 409) rev = (await api('PUT', `api/owner/projects/${app.doc.meta.id}`, obj)).rev; else throw e; }
  app.doc.cloud = true;
  app.doc.sync = { rev, at };
  onDocOpened();
  emit('dirty', { origin: 'cloud-link' });
  toast('已上傳到伺服器，開始即時同步 ☁️');
}
export async function deleteCloudProject(id) { await api('DELETE', `api/owner/projects/${id}`); }

// Called whenever a document becomes active
export function onDocOpened() {
  cloud.queue = [];
  if (app.doc?.cloud && loggedIn()) { snapSynced(); connectWS(); reconcile(app.doc.meta.id); }
  else { cloud.synced = null; if (cloud.ws) { cloud.ws.onclose = null; cloud.ws.close(); cloud.ws = null; } }
  setStatus();
}

// The server is the source of truth for cloud projects: on open, pull newer server state
// (e.g. AI edits made while the app was closed) or push local edits made offline.
async function reconcile(id) {
  let obj;
  try { obj = await api('GET', `api/owner/projects/${id}`); }
  catch (e) { if (e.status === 404 && app.doc?.meta.id === id) { try { await uploadCurrent(); } catch {} } return; }
  if (!app.doc || app.doc.meta.id !== id) return;
  const sync = app.doc.sync || { rev: -1, at: 0 };
  const localDirty = (app.doc.meta.updatedAt || 0) > sync.at;
  if (obj.rev !== sync.rev) {
    if (localDirty) {
      // conflict: keep the local offline edits as a separate local copy, then load the server version
      const copy = { meta: { ...JSON.parse(JSON.stringify(app.doc.meta)), id: uid('P'), name: app.doc.meta.name + '（本機衝突副本）' }, cels: new Map(app.doc.cels), refs: new Map(app.doc.refs), cloud: false };
      emit('saveCopy', copy);
      toast('伺服器有較新的變更：已載入伺服器版本，本機離線修改另存為副本');
    }
    const d = docFromJSON(obj); d.cloud = true; d.sync = { rev: obj.rev, at: Date.now() };
    if (!localDirty && sameContent(d)) { app.doc.sync = d.sync; snapSynced(); return; }
    emit('replaceDoc', d);
  } else if (localDirty) {
    const srv = docFromJSON(obj);
    cloud.synced = { meta: metaKey(srv.meta), cels: srv.cels, refs: srv.refs };
    pushChanges();
  }
}
function sameContent(d) {
  if (metaKey(d.meta) !== metaKey(app.doc.meta) || d.cels.size !== app.doc.cels.size) return false;
  for (const [k, v] of d.cels) { const o = app.doc.cels.get(k); if (!o || o.length !== v.length) return false; for (let i = 0; i < v.length; i++) if (o[i] !== v[i]) return false; }
  return true;
}

// ---------- outgoing sync ----------
on('dirty', ({ origin } = {}) => {
  if (origin === 'remote-local' || !app.doc?.cloud || !loggedIn() || !cloud.synced) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(pushChanges, origin === 'remote' ? 50 : 400);
});
async function pushChanges() {
  if (!app.doc?.cloud || !cloud.synced) return;
  if (cloud.sending) { cloud.timer = setTimeout(pushChanges, 300); return; }
  const patch = diff();
  if (!patch) return;
  const snapshot = { meta: metaKey(app.doc.meta), cels: new Map(app.doc.cels), refs: new Map(app.doc.refs) };
  const at = Date.now();
  cloud.sending = true;
  try {
    const res = await api('PATCH', `api/owner/projects/${app.doc.meta.id}`, patch);
    cloud.synced = snapshot;
    app.doc.sync = { rev: res.rev, at };
    emit('dirty', { origin: 'remote-local' });
    setStatus();
  } catch (e) {
    if (e.status === 404) { try { await uploadCurrent(); } catch {} }
    else { setStatus('error'); cloud.timer = setTimeout(pushChanges, 3000); }
  } finally { cloud.sending = false; }
}
export function syncNow() { clearTimeout(cloud.timer); return pushChanges(); }

// ---------- live updates ----------
let wsRetry = 0;
function connectWS() {
  if (!loggedIn() || !app.doc?.cloud) return;
  if (cloud.ws && cloud.ws.readyState <= 1) { cloud.ws.send(JSON.stringify({ type: 'sub', projectId: app.doc.meta.id })); return; }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = location.pathname.replace(/[^/]*$/, '');
  const ws = new WebSocket(`${proto}//${location.host}${base}ws?token=${encodeURIComponent(cloud.token)}&clientId=${cloud.clientId}`);
  cloud.ws = ws;
  setStatus('connecting');
  ws.onopen = () => { wsRetry = 0; ws.send(JSON.stringify({ type: 'sub', projectId: app.doc.meta.id })); setStatus(); };
  ws.onmessage = (ev) => { try { handleMsg(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
  ws.onclose = (ev) => {
    if (cloud.ws !== ws) return;
    cloud.ws = null;
    setStatus();
    if (ev.code === 4001) { cloud.token = null; localStorage.removeItem('pxs-owner-token'); setStatus(); return; }
    setTimeout(connectWS, Math.min(15000, 1000 * 2 ** wsRetry++));
  };
}

function handleMsg(m) {
  if (m.type === 'activity') { emit('activity', m); return; }
  if (!app.doc || m.projectId !== app.doc.meta.id) return;
  if (m.type === 'patch') {
    cloud.queue.push(m);
    flushQueue();
  } else if (m.type === 'reload') {
    openCloudProject(app.doc.meta.id).then((doc) => emit('replaceDoc', doc));
  } else if (m.type === 'deleted') {
    toast('此專案已在伺服器上被刪除，已轉為本機專案');
    app.doc.cloud = false; onDocOpened();
  }
}

on('idle', () => flushQueue());
on('strokeEnd', () => setTimeout(flushQueue, 0));
function flushQueue() {
  if (!cloud.queue.length || isStroking() || app.floating || app.busy) return;
  const msgs = cloud.queue.splice(0);
  for (const m of msgs) applyRemote(m);
}

function applyRemote(m) {
  const { patch, origin } = m;
  const n = app.doc.meta.width * app.doc.meta.height * 4;
  const label = origin.kind === 'ai' ? `🤖 ${origin.keyName}：${origin.summary || origin.action}`
    : origin.kind === 'revert' ? `↩︎ 還原 AI：${origin.keyName} · ${origin.summary || origin.action}`
    : '☁️ 其他裝置的變更';
  // record as an undoable step
  const before = { meta: JSON.parse(JSON.stringify(app.doc.meta)), cels: new Map(app.doc.cels), refs: new Map(app.doc.refs), ui: { layerId: app.ui.layerId, frame: app.ui.frame } };
  const newW = patch.meta ? patch.meta.width * patch.meta.height * 4 : n;
  if (patch.meta) app.doc.meta = patch.meta;
  if (patch.cels) for (const [k, v] of Object.entries(patch.cels)) {
    if (!v) { app.doc.cels.delete(k); cloud.synced?.cels.delete(k); continue; }
    const b = b64ToBytes(v);
    if (b.length !== newW) continue;
    app.doc.cels.set(k, b);
    cloud.synced?.cels.set(k, b);
  }
  if (patch.refs) for (const [k, v] of Object.entries(patch.refs)) {
    if (v) { app.doc.refs.set(k, v); cloud.synced?.refs.set(k, v); } else { app.doc.refs.delete(k); cloud.synced?.refs.delete(k); }
  }
  if (patch.meta && cloud.synced) cloud.synced.meta = metaKey(app.doc.meta);
  const m2 = app.doc.meta;
  if (!m2.layers.find((l) => l.id === app.ui.layerId)) app.ui.layerId = m2.layers[m2.layers.length - 1].id;
  if (app.ui.frame >= m2.frames.length) app.ui.frame = m2.frames.length - 1;
  const after = { meta: JSON.parse(JSON.stringify(app.doc.meta)), cels: new Map(app.doc.cels), refs: new Map(app.doc.refs), ui: { layerId: app.ui.layerId, frame: app.ui.frame } };
  pushHistory({ label, kind: origin.kind === 'ai' ? 'ai' : 'remote', before, after, time: Date.now(), activityId: origin.activityId });
  changed({ origin: 'remote', silent: true });
  app.doc.sync = { rev: m.rev, at: Date.now() };
  emit('dirty', { origin: 'remote-local' }); // persist to IndexedDB only (cloud already has it)
  if (origin.kind === 'ai') toast(label, 'ai');
}
