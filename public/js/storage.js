// IndexedDB persistence: projects (full data) + summaries (for the project browser) + settings.
import { bytesToB64, b64ToBytes } from './core/raster.js';

let dbp = null;
function db() {
  if (dbp) return dbp;
  const p0 = dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open('pixel-studio', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('summaries', { keyPath: 'id' });
      d.createObjectStore('settings');
    };
    req.onsuccess = () => {
      const d = req.result;
      // The connection can die (Safari < 26.x bug, storage pressure, another tab upgrading): forget it so the next call reopens.
      d.onclose = () => { if (dbp === p0) dbp = null; };
      d.onversionchange = () => { d.close(); if (dbp === p0) dbp = null; };
      resolve(d);
    };
    req.onerror = () => { if (dbp === p0) dbp = null; reject(req.error); };
  });
  return dbp;
}
// Test hook: simulate the browser dropping the IndexedDB connection.
export async function _dropConnectionForTest() { const d = await db(); d.close(); /* close() does not fire onclose */ }
const isDeadConnection = (e) => e && (e.name === 'InvalidStateError' || /closing|closed|connection/i.test(e.message || ''));
function tx(store, mode, fn, retried = false) {
  return db().then((d) => new Promise((resolve, reject) => {
    let t;
    try { t = d.transaction(store, mode); } catch (e) {
      if (!retried && isDeadConnection(e)) { dbp = null; resolve(tx(store, mode, fn, true)); return; }
      reject(e); return;
    }
    const s = Array.isArray(store) ? store.map((n) => t.objectStore(n)) : t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => (result = r));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Fault injection for tests (e2e `savestate`): set faults.save = 'quota' | 'error' to make saves fail.
export const faults = { save: null };
function injected() {
  const f = faults.save;
  if (!f) return null;
  if (f === 'quota') { try { return new DOMException('The quota has been exceeded.', 'QuotaExceededError'); } catch { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; return e; } }
  return new Error('injected save failure');
}
export function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota|space/i.test(e.message || ''));
}
// Storage usage as the browser reports it (may be approximate, esp. Safari).
export async function storageInfo() {
  const out = { usage: null, quota: null, persisted: null };
  try { const e = await navigator.storage?.estimate?.(); if (e) { out.usage = e.usage ?? null; out.quota = e.quota ?? null; } } catch {}
  try { out.persisted = (await navigator.storage?.persisted?.()) ?? null; } catch {}
  return out;
}

export async function saveProject(doc, thumb) {
  const fe = injected();
  if (fe) throw fe;
  const m = doc.meta;
  const cels = {};
  for (const [k, v] of doc.cels) cels[k] = v;
  const rec = { id: m.id, meta: m, cels, refs: Object.fromEntries(doc.refs), cloud: !!doc.cloud, sync: doc.sync || null };
  const sum = { id: m.id, name: m.name, width: m.width, height: m.height, frames: m.frames.length, updatedAt: m.updatedAt || Date.now(), thumb, cloud: !!doc.cloud };
  await tx(['projects', 'summaries'], 'readwrite', ([p, s]) => { p.put(rec); s.put(sum); });
}
export async function loadProject(id) {
  const rec = await tx('projects', 'readonly', (s) => reqP(s.get(id)));
  if (!rec) return null;
  const cels = new Map();
  for (const [k, v] of Object.entries(rec.cels || {})) if (v) cels.set(k, v instanceof Uint8ClampedArray ? v : new Uint8ClampedArray(v));
  return { meta: rec.meta, cels, refs: new Map(Object.entries(rec.refs || {})), cloud: !!rec.cloud, sync: rec.sync || null };
}
export async function listProjects() {
  const all = await tx('summaries', 'readonly', (s) => reqP(s.getAll()));
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function deleteProject(id) {
  await tx(['projects', 'summaries'], 'readwrite', ([p, s]) => { p.delete(id); s.delete(id); });
}
export async function getSetting(k, def = null) {
  try { const v = await tx('settings', 'readonly', (s) => reqP(s.get(k))); return v === undefined ? def : v; } catch { return def; }
}
export async function setSetting(k, v) {
  try { await tx('settings', 'readwrite', (s) => s.put(v, k)); } catch {}
}

// ---------- .pxs (portable JSON) ----------
export function docToJSON(doc) {
  const cels = {};
  for (const [k, v] of doc.cels) cels[k] = bytesToB64(v);
  return { format: 'pixel-studio', version: 1, meta: doc.meta, cels, refs: Object.fromEntries(doc.refs) };
}
export function docFromJSON(obj) {
  if (!obj || obj.format !== 'pixel-studio' || !obj.meta) throw new Error('不是 Pixel Studio 專案檔');
  const cels = new Map();
  const n = obj.meta.width * obj.meta.height * 4;
  for (const [k, v] of Object.entries(obj.cels || {})) { if (!v) continue; const b = b64ToBytes(v); if (b.length === n) cels.set(k, b); }
  const m = obj.meta;
  m.tags = m.tags || []; m.references = m.references || []; m.palette = m.palette || [];
  return { meta: m, cels, refs: new Map(Object.entries(obj.refs || {})), cloud: false };
}
