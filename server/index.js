// Pixel Studio optional local server: serves the PWA, owner cloud storage, AI REST API, MCP and live sync.
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as store from './store.js';
import { OPS, runOp, ApiError } from './ops.js';
import { mountMcp } from './mcp.js';
import { buildOpenApi, docsPage } from './openapi.js';
import { newProjectMeta } from '../public/js/core/raster.js';
import { DEFAULT_PALETTE } from '../public/js/core/palettes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = fs.existsSync(path.join(ROOT, 'dist', 'index.html')) ? path.join(ROOT, 'dist') : path.join(ROOT, 'public');
const owner = store.getOwnerPassword();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '80mb' }));

// CORS for the AI API / MCP (agents may call from other origins)
app.use(['/api/v1', '/mcp', '/api/openapi.json'], (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, X-Api-Key');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const sendErr = (res, e) => {
  if (e instanceof ApiError) return res.status(e.status).json({ error: { code: e.code, message: e.message } });
  console.error(e);
  res.status(500).json({ error: { code: 'internal', message: e.message } });
};

// ---------------- WebSocket hub ----------------
const clients = new Set(); // {ws, projectId, clientId}
const hub = {
  broadcast(projectId, msg, exceptClientId = null) {
    const data = JSON.stringify(msg);
    for (const c of clients) if (c.projectId === projectId && c.clientId !== exceptClientId && c.ws.readyState === 1) c.ws.send(data);
  },
  broadcastAll(msg) {
    const data = JSON.stringify(msg);
    for (const c of clients) if (c.ws.readyState === 1) c.ws.send(data);
  },
};

// ---------------- Health & auth ----------------
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'pixel-studio', version: '0.1.0', time: Date.now() }));

const loginAttempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  const a = loginAttempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 60000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: { code: 'rate_limited', message: '嘗試次數過多，請稍後再試' } });
  const pw = String(req.body?.password || '');
  const ok = pw.length === owner.password.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(owner.password));
  if (!ok) { a.n++; loginAttempts.set(ip, a); return res.status(401).json({ error: { code: 'bad_password', message: '密碼錯誤' } }); }
  res.json({ token: store.createSession() });
});

function ownerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ') && !h.slice(7).startsWith('pxs_')) return h.slice(7).trim();
  return req.headers['x-owner-token'] || req.query.token;
}
function requireOwner(req, res, next) {
  if (!store.checkSession(ownerToken(req))) return res.status(401).json({ error: { code: 'unauthorized', message: '需要擁有者登入' } });
  next();
}
app.get('/api/auth/me', requireOwner, (_req, res) => res.json({ owner: true }));
app.post('/api/auth/logout', requireOwner, (req, res) => { store.destroySession(ownerToken(req)); res.json({ ok: true }); });

// ---------------- Owner: projects ----------------
const O = express.Router();
O.use(requireOwner);
O.get('/projects', (_req, res) => res.json({ projects: store.listProjects() }));
O.post('/projects', (req, res) => {
  try {
    let obj = req.body;
    if (!obj?.meta) {
      const meta = newProjectMeta({ name: obj?.name || '未命名', width: obj?.width | 0 || 32, height: obj?.height | 0 || 32, palette: DEFAULT_PALETTE.slice() });
      obj = { meta, cels: {}, refs: {} };
    }
    if (store.getProject(obj.meta.id)) return res.status(409).json({ error: { code: 'exists', message: '專案已存在，請用 PUT' } });
    const p = store.putProject(obj);
    res.json(store.serializeProject(p));
  } catch (e) { res.status(400).json({ error: { code: 'bad_project', message: e.message } }); }
});
O.get('/projects/:id', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: { code: 'not_found', message: '找不到專案' } });
  res.json(store.serializeProject(p));
});
O.put('/projects/:id', (req, res) => {
  try {
    const obj = req.body;
    if (!obj?.meta || obj.meta.id !== req.params.id) throw new Error('meta.id 不符');
    const p = store.putProject(obj);
    hub.broadcast(p.meta.id, { type: 'reload', projectId: p.meta.id, rev: p.rev }, req.headers['x-client-id']);
    res.json({ ok: true, rev: p.rev });
  } catch (e) { res.status(400).json({ error: { code: 'bad_project', message: e.message } }); }
});
O.patch('/projects/:id', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: { code: 'not_found', message: '找不到專案' } });
  try {
    const patch = req.body || {};
    if (patch.meta && patch.meta.id !== p.meta.id) throw new Error('meta.id 不符');
    store.applyPatch(p, patch);
    hub.broadcast(p.meta.id, { type: 'patch', projectId: p.meta.id, rev: p.rev, patch: store.patchForWire(p, patch), origin: { kind: 'owner', clientId: req.headers['x-client-id'] || null } }, req.headers['x-client-id']);
    res.json({ ok: true, rev: p.rev });
  } catch (e) { res.status(400).json({ error: { code: 'bad_patch', message: e.message } }); }
});
O.delete('/projects/:id', (req, res) => {
  const ok = store.deleteProject(req.params.id);
  hub.broadcast(req.params.id, { type: 'deleted', projectId: req.params.id });
  res.json({ ok });
});

// ---------------- Owner: API keys ----------------
O.get('/keys', (_req, res) => res.json({ keys: store.listKeys(), scopes: store.SCOPES }));
O.post('/keys', (req, res) => {
  const { name, scopes, projects, rateLimit } = req.body || {};
  if (!Array.isArray(scopes) || !scopes.length) return res.status(400).json({ error: { code: 'bad_scopes', message: '至少選一個權限範圍' } });
  res.json(store.createKey({ name, scopes, projects, rateLimit }));
});
O.patch('/keys/:id', (req, res) => {
  const k = store.updateKey(req.params.id, req.body || {});
  if (!k) return res.status(404).json({ error: { code: 'not_found', message: '找不到金鑰' } });
  res.json(k);
});
const revoke = (req, res) => {
  const k = store.revokeKey(req.params.id);
  if (!k) return res.status(404).json({ error: { code: 'not_found', message: '找不到金鑰' } });
  res.json(k);
};
O.post('/keys/:id/revoke', revoke);
O.delete('/keys/:id', revoke);

// ---------------- Owner: activity ----------------
O.get('/activity', (req, res) => res.json({ activity: store.listActivity({ projectId: req.query.projectId, limit: Math.min(1000, Number(req.query.limit) || 200) }) }));
O.post('/activity/:id/revert', (req, res) => {
  const e = store.getActivity(req.params.id);
  if (!e) return res.status(404).json({ error: { code: 'not_found', message: '找不到紀錄' } });
  if (e.reverted) return res.status(409).json({ error: { code: 'already_reverted', message: '已經還原過了' } });
  const inv = store.getUndo(e.id);
  const p = store.getProject(e.projectId);
  if (!inv || !p) return res.status(410).json({ error: { code: 'gone', message: '無法還原（資料已不存在）' } });
  try {
    // keep frames/layers that still exist after later edits: only restore meta if it was a structural op
    store.applyPatch(p, inv);
    store.markReverted(e.id);
    const entry = store.logActivity({ keyId: null, keyName: '擁有者', projectId: p.meta.id, action: 'revert', summary: `還原：${e.keyName} · ${e.summary}`, via: 'owner', write: true }, null);
    hub.broadcast(p.meta.id, { type: 'patch', projectId: p.meta.id, rev: p.rev, patch: store.patchForWire(p, inv), origin: { kind: 'revert', keyName: e.keyName, action: e.action, summary: e.summary, activityId: e.id } });
    hub.broadcastAll({ type: 'activity', entry, reverted: e.id });
    res.json({ ok: true, rev: p.rev });
  } catch (err) { sendErr(res, err); }
});
app.use('/api/owner', O);

// ---------------- AI REST API (API key) ----------------
// Hard rule: API keys can never delete anything. Reject every DELETE before even authenticating.
app.delete(['/api/v1', '/api/v1/*'], (_req, res) => res.status(403).json({ error: { code: 'forbidden_delete', message: 'API 金鑰沒有任何刪除權限（不可刪除專案、圖層、影格或 cel）' } }));
app.put(['/api/v1', '/api/v1/*'], (_req, res) => res.status(405).json({ error: { code: 'method_not_allowed', message: '請參考 /docs 使用 GET / POST' } }));
app.patch(['/api/v1', '/api/v1/*'], (_req, res) => res.status(405).json({ error: { code: 'method_not_allowed', message: '請參考 /docs 使用 GET / POST' } }));

function requireKey(req, res, next) {
  const h = req.headers.authorization || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7).trim() : req.headers['x-api-key'];
  const key = store.findKey(raw);
  if (!key) return res.status(401).json({ error: { code: 'unauthorized', message: '需要有效的 API 金鑰（Authorization: Bearer pxs_...）' } });
  req.apiKey = key;
  next();
}
function coerce(op, q) {
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    const s = op.input.properties[k];
    if (!s) continue;
    const t = Array.isArray(s.type) ? s.type : [s.type];
    if (t.includes('integer') && /^-?\d+$/.test(v)) out[k] = Number(v);
    else if (t.includes('number') && v !== '' && !isNaN(v)) out[k] = Number(v);
    else if (t.includes('boolean')) out[k] = v === 'true' || v === '1';
    else out[k] = v;
  }
  return out;
}
const V1 = express.Router();
V1.use(requireKey);
for (const op of OPS) {
  const route = op.path.replace('{projectId}', ':projectId');
  V1[op.method.toLowerCase()](route, (req, res) => {
    try {
      const args = op.method === 'GET' ? coerce(op, req.query) : { ...(req.body || {}) };
      if (req.params.projectId) args.projectId = req.params.projectId;
      const out = runOp(op.name, args, req.apiKey, hub, 'rest');
      if (op.image && out.image && req.query.format !== 'base64') {
        res.set('Content-Type', 'image/png');
        return res.send(Buffer.from(out.image));
      }
      const body = { ...(out.restResult || out.result), activityId: out.activityId, rev: out.rev };
      if (out.image) body.image = 'data:image/png;base64,' + Buffer.from(out.image).toString('base64');
      res.json(body);
    } catch (e) { sendErr(res, e); }
  });
}
V1.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: '未知的端點，請參考 /docs' } }));
app.use('/api/v1', V1);

app.get('/api/openapi.json', (req, res) => res.json(buildOpenApi(baseUrl(req))));
app.get('/docs', (req, res) => res.type('html').send(docsPage(baseUrl(req))));
mountMcp(app, hub);

// ---------------- Static PWA ----------------
app.use(express.static(STATIC_DIR, {
  setHeaders(res, file) {
    if (file.endsWith('sw.js') || file.endsWith('.html') || file.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
  },
}));
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'not found' } }));
app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// ---------------- Start ----------------
let server;
if (process.env.TLS_CERT && process.env.TLS_KEY) {
  server = https.createServer({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) }, app);
} else server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  if (!store.checkSession(url.searchParams.get('token'))) { ws.close(4001, 'unauthorized'); return; }
  const c = { ws, projectId: null, clientId: url.searchParams.get('clientId') || null };
  clients.add(c);
  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data);
      if (m.type === 'sub') { c.projectId = m.projectId; const p = store.getProject(m.projectId); ws.send(JSON.stringify({ type: 'subbed', projectId: m.projectId, rev: p?.rev ?? null })); }
      else if (m.type === 'ping') ws.send('{"type":"pong"}');
    } catch {}
  });
  ws.on('close', () => clients.delete(c));
});
const ping = setInterval(() => { for (const c of clients) if (c.ws.readyState === 1) c.ws.ping(); }, 30000);

server.listen(PORT, HOST, () => {
  const proto = process.env.TLS_CERT ? 'https' : 'http';
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n🎨 Pixel Studio 伺服器已啟動');
  console.log(`   本機:   ${proto}://localhost:${PORT}`);
  for (const ip of lan) console.log(`   區網:   ${proto}://${ip}:${PORT}   ← iPad / iPhone 連同一個 Wi-Fi 開這個`);
  console.log(`   API 文件: ${proto}://localhost:${PORT}/docs   MCP: ${proto}://localhost:${PORT}/mcp`);
  console.log(`   資料夾: ${store.DATA_DIR}`);
  if (owner.generated) console.log(`   擁有者密碼（自動產生，存於 ${owner.file}）: ${owner.password}`);
  else console.log('   擁有者密碼: 使用環境變數 OWNER_PASSWORD');
  console.log('');
});

function shutdown() {
  clearInterval(ping);
  store.flushAll();
  store.flushActivity();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
