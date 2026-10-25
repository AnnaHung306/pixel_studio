// File-based persistence: projects as JSON, API keys, sessions, activity log.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { uid, b64ToBytes, bytesToB64, isEmpty } from '../public/js/core/raster.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const PROJ_DIR = path.join(DATA_DIR, 'projects');
const UNDO_DIR = path.join(DATA_DIR, 'undo');
fs.mkdirSync(PROJ_DIR, { recursive: true });
fs.mkdirSync(UNDO_DIR, { recursive: true });

function atomicWrite(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
const safeId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));

// ---------------- Owner password & sessions ----------------
export function getOwnerPassword() {
  if (process.env.OWNER_PASSWORD) return { password: process.env.OWNER_PASSWORD, generated: false };
  const f = path.join(DATA_DIR, 'owner-password.txt');
  if (fs.existsSync(f)) return { password: fs.readFileSync(f, 'utf8').trim(), generated: true, file: f };
  const pw = crypto.randomBytes(6).toString('base64url');
  atomicWrite(f, pw + '\n');
  return { password: pw, generated: true, file: f, fresh: true };
}

const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const sessions = new Map(Object.entries(readJSON(SESS_FILE, {})));
const SESSION_TTL = 30 * 24 * 3600 * 1000;
function saveSessions() { atomicWrite(SESS_FILE, JSON.stringify(Object.fromEntries(sessions))); }
export function createSession() {
  const token = crypto.randomBytes(24).toString('base64url');
  sessions.set(token, { created: Date.now() });
  saveSessions();
  return token;
}
export function checkSession(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(token); saveSessions(); return false; }
  return true;
}
export function destroySession(token) { sessions.delete(token); saveSessions(); }

// ---------------- API keys ----------------
export const SCOPES = {
  'project:read': '讀取專案列表與概覽',
  'canvas:read': '讀取影格 / 圖層影像（PNG）與像素陣列',
  'canvas:write': '繪製像素、線條、矩形、橢圓、填色、貼上 PNG',
  'layer:create': '新增圖層',
  'frame:create': '新增影格、設定影格時長、新增標籤',
  'palette:write': '修改調色盤',
  'reference:read': '讀取擁有者上傳的參考 / 設計圖',
};
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
let keys = readJSON(KEYS_FILE, []);
function saveKeys() { atomicWrite(KEYS_FILE, JSON.stringify(keys, null, 2)); }
const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');
export const publicKey = (k) => {
  const { hash, ...rest } = k;
  return rest;
};
export function listKeys() { return keys.map(publicKey); }
export function createKey({ name, scopes, projects, rateLimit }) {
  const raw = 'pxs_' + crypto.randomBytes(24).toString('base64url');
  const valid = (scopes || []).filter((s) => SCOPES[s]);
  const k = {
    id: uid('K'),
    name: String(name || 'AI').slice(0, 60),
    prefix: raw.slice(0, 10),
    hash: hashKey(raw),
    scopes: valid,
    projects: projects === '*' || !Array.isArray(projects) ? '*' : projects.filter(safeId),
    rateLimit: Math.max(1, Math.min(10000, parseInt(rateLimit, 10) || 120)),
    createdAt: Date.now(),
    revokedAt: null,
    lastUsedAt: null,
  };
  keys.push(k);
  saveKeys();
  return { key: raw, info: publicKey(k) };
}
export function updateKey(id, patch) {
  const k = keys.find((x) => x.id === id);
  if (!k) return null;
  if (patch.name) k.name = String(patch.name).slice(0, 60);
  if (Array.isArray(patch.scopes)) k.scopes = patch.scopes.filter((s) => SCOPES[s]);
  if (patch.projects) k.projects = patch.projects === '*' ? '*' : patch.projects.filter(safeId);
  if (patch.rateLimit) k.rateLimit = Math.max(1, Math.min(10000, parseInt(patch.rateLimit, 10) || 120));
  saveKeys();
  return publicKey(k);
}
export function revokeKey(id) {
  const k = keys.find((x) => x.id === id);
  if (!k) return null;
  k.revokedAt = k.revokedAt || Date.now();
  saveKeys();
  return publicKey(k);
}
export function findKey(raw) {
  if (!raw || !raw.startsWith('pxs_')) return null;
  const h = hashKey(raw);
  const k = keys.find((x) => x.hash === h);
  if (!k || k.revokedAt) return null;
  return k;
}
let lastUsedDirty = false;
export function touchKey(k) {
  k.lastUsedAt = Date.now();
  if (!lastUsedDirty) { lastUsedDirty = true; setTimeout(() => { lastUsedDirty = false; saveKeys(); }, 5000); }
}

// ---------------- Projects ----------------
// In memory: { meta, cels: Map<key, Uint8ClampedArray>, refs: Map<id, dataUrl>, rev }
const cache = new Map();
const pending = new Map();
const projFile = (id) => path.join(PROJ_DIR, id + '.json');

export function serializeProject(p) {
  const cels = {};
  for (const [k, v] of p.cels) cels[k] = bytesToB64(v);
  return { format: 'pixel-studio', version: 1, meta: p.meta, cels, refs: Object.fromEntries(p.refs), rev: p.rev };
}
export function deserializeProject(obj) {
  const cels = new Map();
  for (const [k, v] of Object.entries(obj.cels || {})) if (v) cels.set(k, b64ToBytes(v));
  return { meta: obj.meta, cels, refs: new Map(Object.entries(obj.refs || {})), rev: obj.rev || 0 };
}

export function listProjects() {
  const out = [];
  const ids = new Set(cache.keys());
  for (const f of fs.readdirSync(PROJ_DIR)) if (f.endsWith('.json')) ids.add(f.slice(0, -5));
  for (const id of ids) {
    const p = getProject(id);
    if (p) out.push(projectSummary(p));
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
export function projectSummary(p) {
  const m = p.meta;
  return { id: m.id, name: m.name, width: m.width, height: m.height, layers: m.layers.length, frames: m.frames.length, updatedAt: m.updatedAt, rev: p.rev };
}
export function getProject(id) {
  if (!safeId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const f = projFile(id);
  if (!fs.existsSync(f)) return null;
  const obj = readJSON(f, null);
  if (!obj || !obj.meta) return null;
  const p = deserializeProject(obj);
  cache.set(id, p);
  return p;
}
export function saveProjectSoon(p) {
  const id = p.meta.id;
  if (pending.has(id)) return;
  pending.set(id, setTimeout(() => {
    pending.delete(id);
    atomicWrite(projFile(id), JSON.stringify(serializeProject(p)));
  }, 300));
}
export function flushAll() {
  for (const [id, t] of pending) {
    clearTimeout(t);
    const p = cache.get(id);
    if (p) atomicWrite(projFile(id), JSON.stringify(serializeProject(p)));
  }
  pending.clear();
}
export function putProject(obj) {
  const p = deserializeProject(obj);
  if (!p.meta || !safeId(p.meta.id)) throw new Error('invalid project');
  validateMeta(p.meta);
  const old = cache.get(p.meta.id) || getProject(p.meta.id);
  p.rev = (old ? old.rev : 0) + 1;
  p.meta.updatedAt = Date.now();
  cache.set(p.meta.id, p);
  saveProjectSoon(p);
  return p;
}
export function deleteProject(id) {
  if (!safeId(id)) return false;
  if (pending.has(id)) { clearTimeout(pending.get(id)); pending.delete(id); }
  cache.delete(id);
  const f = projFile(id);
  if (fs.existsSync(f)) { fs.renameSync(f, f + '.deleted-' + Date.now()); return true; }
  return false;
}

export function validateMeta(m) {
  const okNum = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  if (!okNum(m.width, 1, 2048) || !okNum(m.height, 1, 2048)) throw new Error('invalid size');
  if (!Array.isArray(m.layers) || !m.layers.length) throw new Error('invalid layers');
  if (!Array.isArray(m.frames) || !m.frames.length) throw new Error('invalid frames');
  m.tags = Array.isArray(m.tags) ? m.tags : [];
  m.references = Array.isArray(m.references) ? m.references : [];
  m.palette = Array.isArray(m.palette) ? m.palette : [];
}

// Apply a patch: { meta?, cels?: {key: b64|null}, refs?: {id: dataUrl|null} }
// Returns the inverse patch (for undo / revert).
export function applyPatch(p, patch) {
  const inverse = {};
  if (patch.meta) {
    validateMeta(patch.meta);
    inverse.meta = p.meta;
    p.meta = { ...patch.meta, id: p.meta.id };
  }
  if (patch.cels) {
    inverse.cels = {};
    for (const [k, v] of Object.entries(patch.cels)) {
      const old = p.cels.get(k);
      inverse.cels[k] = old ? bytesToB64(old) : null;
      const buf = v ? (typeof v === 'string' ? b64ToBytes(v) : v) : null;
      if (buf && buf.length !== p.meta.width * p.meta.height * 4) throw new Error(`cel ${k} has wrong size`);
      if (!buf || isEmpty(buf)) p.cels.delete(k);
      else p.cels.set(k, buf);
    }
  }
  if (patch.refs) {
    inverse.refs = {};
    for (const [k, v] of Object.entries(patch.refs)) {
      inverse.refs[k] = p.refs.get(k) || null;
      if (v) p.refs.set(k, v); else p.refs.delete(k);
    }
  }
  p.meta.updatedAt = Date.now();
  p.rev++;
  saveProjectSoon(p);
  return inverse;
}

// Build a patch for broadcasting: cels serialized to b64
export function patchForWire(p, patch) {
  const out = {};
  if (patch.meta) out.meta = p.meta;
  if (patch.cels) {
    out.cels = {};
    for (const k of Object.keys(patch.cels)) {
      const b = p.cels.get(k);
      out.cels[k] = b ? bytesToB64(b) : null;
    }
  }
  if (patch.refs) {
    out.refs = {};
    for (const k of Object.keys(patch.refs)) out.refs[k] = p.refs.get(k) || null;
  }
  return out;
}

// ---------------- Activity log ----------------
const ACT_FILE = path.join(DATA_DIR, 'activity.json');
let activity = readJSON(ACT_FILE, []);
let actDirty = null;
function saveActivitySoon() {
  if (actDirty) return;
  actDirty = setTimeout(() => { actDirty = null; atomicWrite(ACT_FILE, JSON.stringify(activity)); }, 500);
}
export function logActivity(entry, inverse) {
  const e = { id: uid('A'), time: Date.now(), reverted: false, ...entry, hasUndo: !!inverse };
  activity.push(e);
  if (activity.length > 3000) {
    const removed = activity.splice(0, activity.length - 3000);
    for (const r of removed) { try { fs.unlinkSync(path.join(UNDO_DIR, r.id + '.json')); } catch {} }
  }
  if (inverse) atomicWrite(path.join(UNDO_DIR, e.id + '.json'), JSON.stringify(inverse));
  saveActivitySoon();
  return e;
}
export function listActivity({ projectId, limit = 200 } = {}) {
  let a = activity;
  if (projectId) a = a.filter((e) => e.projectId === projectId);
  return a.slice(-limit).reverse();
}
export function getActivity(id) { return activity.find((e) => e.id === id) || null; }
export function getUndo(id) { return readJSON(path.join(UNDO_DIR, id + '.json'), null); }
export function markReverted(id) {
  const e = getActivity(id);
  if (e) { e.reverted = Date.now(); saveActivitySoon(); }
  return e;
}
export function flushActivity() {
  if (actDirty) { clearTimeout(actDirty); actDirty = null; }
  atomicWrite(ACT_FILE, JSON.stringify(activity));
}
