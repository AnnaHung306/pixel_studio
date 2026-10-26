// Diagnostics (1.4.0): a local ring buffer of errors/events + an environment snapshot the user can copy or
// download when reporting a problem. Never uploaded automatically and never includes artwork pixels.
import { APP_VERSION } from './version.js';

const MAX = 100;
export const log = [];
const listeners = new Set();
export function record(level, msg, extra = null) {
  const e = { t: new Date().toISOString(), level, msg: String(msg).slice(0, 500) };
  if (extra) e.extra = String(extra).slice(0, 1500);
  log.push(e);
  if (log.length > MAX) log.splice(0, log.length - MAX);
  for (const fn of listeners) { try { fn(e); } catch {} }
  return e;
}
export function onRecord(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let installed = false;
// Global capture of uncaught errors and unhandled promise rejections.
export function installErrorCapture() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (ev) => {
    if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) { record('error', `資源載入失敗：${ev.target.src || ev.target.href}`); return; }
    record('error', ev.message || 'Error', ev.error?.stack || `${ev.filename || ''}:${ev.lineno || ''}:${ev.colno || ''}`);
  }, true);
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    record('error', 'Unhandled rejection: ' + (r?.message || r), r?.stack || null);
  });
}

const fmtMB = (b) => (b == null ? '—' : (b / 1048576).toFixed(1) + ' MB');
// Gather an environment snapshot. `ctx` supplies app state from main.js (kept out of here to avoid cycles).
export async function environment(ctx = {}) {
  const nav = navigator;
  const mm = (q) => { try { return matchMedia(q).matches; } catch { return null; } };
  const env = {
    app: { version: APP_VERSION, build: document.querySelector('script[type=module]')?.src || '', url: location.origin + location.pathname },
    time: new Date().toISOString(),
    device: {
      userAgent: nav.userAgent,
      platform: nav.platform || '',
      maxTouchPoints: nav.maxTouchPoints || 0,
      deviceMemoryGB: nav.deviceMemory ?? null,
      cores: nav.hardwareConcurrency ?? null,
      language: nav.language,
      ios: /iP(hone|ad|od)/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1),
      note: 'iPadOS 26 起 Safari 的 UA 版本號固定，請另行填寫實際 iPadOS 版本',
    },
    display: {
      viewport: `${innerWidth}×${innerHeight}`, screen: `${screen.width}×${screen.height}`, dpr: devicePixelRatio,
      orientation: screen.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait'),
      standalone: mm('(display-mode: standalone)') || nav.standalone === true,
      pointerCoarse: mm('(pointer: coarse)'), hover: mm('(hover: hover)'),
      touchUI: document.documentElement.classList.contains('touch'),
    },
    offline: { serviceWorker: 'serviceWorker' in nav ? (nav.serviceWorker.controller ? 'controlled' : 'not controlling') : 'unsupported', secureContext: window.isSecureContext, caches: [] },
    storage: { usage: null, quota: null, persisted: null },
    ...ctx,
  };
  try { env.offline.caches = await caches.keys(); } catch {}
  try { const e = await nav.storage?.estimate?.(); if (e) { env.storage.usage = fmtMB(e.usage); env.storage.quota = fmtMB(e.quota); } } catch {}
  try { env.storage.persisted = (await nav.storage?.persisted?.()) ?? null; } catch {}
  return env;
}
export function reportObject(env) { return { format: 'pixel-studio-diagnostics', version: 1, environment: env, log: log.slice() }; }
export function formatReport(env) {
  const lines = ['Pixel Studio 診斷資訊', `版本 ${env.app.version} · ${env.time}`, ''];
  const sec = (title, obj) => { lines.push(`[${title}]`); for (const [k, v] of Object.entries(obj || {})) lines.push(`  ${k}: ${Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' && v ? JSON.stringify(v) : v ?? '—'}`); lines.push(''); };
  sec('裝置', env.device); sec('顯示', env.display); sec('離線', env.offline); sec('儲存', env.storage);
  if (env.project) sec('專案', env.project);
  if (env.history) sec('復原歷史', env.history);
  if (env.save) sec('自動儲存', env.save);
  if (env.server) sec('伺服器', env.server);
  lines.push(`[最近紀錄（${log.length}）]`);
  for (const e of log.slice(-30)) lines.push(`  ${e.t} ${e.level.toUpperCase()} ${e.msg}`);
  return lines.join('\n');
}
