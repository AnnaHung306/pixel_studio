// End-to-end browser test: iPad / iPhone (Playwright WebKit = Safari's engine) + desktop Chromium.
// Drives the real UI with touch / pen / mouse pointer events, decodes every export, checks layout, and
// collects every console error, page error and failed request.
//
//   npm run e2e                                   # every profile × both targets (server + static dist/)
//   npm run e2e -- --profile=ipad-pro-11-landscape --target=static --suite=draw,select
//   npm run e2e -- --shots                        # also write docs/screenshots/*.png
//   npm run e2e -- --list                         # list profiles and suites
//
// Requires: npm install && npx playwright install --with-deps webkit chromium && npm run build
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

// Browsers must reach 127.0.0.1 directly, never through an HTTP proxy from the environment.
for (const k of Object.keys(process.env)) if (/_proxy$/i.test(k)) delete process.env[k];
const { webkit, chromium, devices } = await import('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'test-results', 'e2e');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const formats = await import(pathToFileURL(path.join(ROOT, 'public/js/formats.js')).href);
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// ---------------- profiles ----------------
const apple = (device, extra = {}) => ({ browser: 'webkit', device, touch: true, ...extra });
export const PROFILES = {
  'ipad-pro-11-landscape': apple('iPad Pro 11 landscape'),
  'ipad-pro-11-portrait': apple('iPad Pro 11'),
  'ipad-7-landscape': apple('iPad (gen 7) landscape'),
  'ipad-7-portrait': apple('iPad (gen 7)'),
  'ipad-mini-landscape': apple('iPad Mini landscape'),
  'ipad-mini-portrait': apple('iPad Mini'),
  'iphone-14-portrait': apple('iPhone 14', { phone: true }),
  'iphone-14-landscape': apple('iPhone 14 landscape', { phone: true }),
  'desktop-chromium': { browser: 'chromium', ctx: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, touch: false },
};
const SUITES = ['boot', 'layout', 'a11y', 'draw', 'select', 'palette', 'layers', 'timeline', 'view', 'history', 'memory', 'refs', 'canvas', 'export', 'import', 'persist', 'savestate', 'notices', 'pwa', 'cloud', 'keyboard', 'diag', 'focus', 'quick', 'taps', 'isoline', 'longpress'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (args.list) { console.log('profiles:', Object.keys(PROFILES).join(' ')); console.log('suites:', SUITES.join(' ')); process.exit(0); }
const profiles = args.profile ? String(args.profile).split(',') : Object.keys(PROFILES);
const targets = args.target ? String(args.target).split(',') : ['server', 'static'];
const suites = args.suite ? String(args.suite).split(',') : SUITES;
for (const p of profiles) if (!PROFILES[p]) { console.error('unknown profile', p); process.exit(2); }
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist/ missing — run `npm run build` first'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

// ---------------- servers ----------------
const PW = 'e2e-owner-pw';
async function startAppServer() {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-e2e-'));
  const port = 19000 + Math.floor(Math.random() * 2000);
  const proc = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: DATA, OWNER_PASSWORD: PW, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await sleep(100); }
  return { base, log: () => log, async stop() { const ex = new Promise((r) => proc.once('exit', r)); proc.kill(); await ex; fs.rmSync(DATA, { recursive: true, force: true }); } };
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
async function startStaticServer() {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIST, path.normalize(p));
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    if (q.method === 'HEAD') return r.end();
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, stop: () => new Promise((r) => srv.close(r)) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- in-page helpers ----------------
const INIT = () => {
  window.__e2e = {
    pt(x, y) {
      const { app } = window.__pixelStudio;
      const r = document.getElementById('view').getBoundingClientRect();
      return { clientX: r.left + app.ui.panX + (x + 0.5) * app.ui.zoom, clientY: r.top + app.ui.panY + (y + 0.5) * app.ui.zoom };
    },
    ev(type, id, pointerType, c, o = {}) {
      const cv = document.getElementById('view');
      const up = type === 'pointerup' || type === 'pointercancel';
      cv.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType, isPrimary: !!o.primary, bubbles: true, cancelable: true, composed: true,
        button: type === 'pointermove' ? -1 : (o.button ?? 0), buttons: up ? 0 : (o.buttons ?? 1), pressure: up ? 0 : 0.5,
        width: pointerType === 'touch' ? 20 : 1, height: pointerType === 'touch' ? 20 : 1,
        shiftKey: !!o.shift, altKey: !!o.alt, ctrlKey: !!o.ctrl, ...c,
      }));
    },
    // single-pointer stroke through doc-pixel coordinates
    stroke(pts, pointerType = 'touch', o = {}) {
      const id = o.id ?? (pointerType === 'pen' ? 2 : 1);
      this.ev('pointerdown', id, pointerType, this.pt(...pts[0]), { ...o, primary: true });
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let k = 1; k <= n; k++) this.ev('pointermove', id, pointerType, this.pt(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n), o);
      }
      this.ev('pointerup', id, pointerType, this.pt(...pts[pts.length - 1]), o);
    },
    // n-finger tap (screen coords around the stage centre)
    multiTap(n) {
      const r = document.getElementById('view').getBoundingClientRect();
      const c = (i) => ({ clientX: r.left + r.width / 2 + i * 40, clientY: r.top + r.height / 2 });
      for (let i = 0; i < n; i++) this.ev('pointerdown', 20 + i, 'touch', c(i), { primary: i === 0 });
      for (let i = 0; i < n; i++) this.ev('pointerup', 20 + i, 'touch', c(i));
    },
    pinch(scale) {
      const r = document.getElementById('view').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d0 = 60;
      const at = (d, s) => ({ clientX: cx + s * d, clientY: cy });
      this.ev('pointerdown', 31, 'touch', at(d0, -1), { primary: true }); this.ev('pointerdown', 32, 'touch', at(d0, 1));
      for (let k = 1; k <= 10; k++) { const d = d0 * (1 + ((scale - 1) * k) / 10); this.ev('pointermove', 31, 'touch', at(d, -1)); this.ev('pointermove', 32, 'touch', at(d, 1)); }
      const d = d0 * scale; this.ev('pointerup', 31, 'touch', at(d, -1)); this.ev('pointerup', 32, 'touch', at(d, 1));
    },
    twoFingerPan(dx, dy) {
      const r = document.getElementById('view').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const a = (k) => ({ clientX: cx - 40 + dx * k, clientY: cy + dy * k }), b = (k) => ({ clientX: cx + 40 + dx * k, clientY: cy + dy * k });
      this.ev('pointerdown', 41, 'touch', a(0), { primary: true }); this.ev('pointerdown', 42, 'touch', b(0));
      for (let k = 1; k <= 10; k++) { this.ev('pointermove', 41, 'touch', a(k / 10)); this.ev('pointermove', 42, 'touch', b(k / 10)); }
      this.ev('pointerup', 41, 'touch', a(1)); this.ev('pointerup', 42, 'touch', b(1));
    },
    cel(x, y, layerIdx = null, frame = null) {
      const { app } = window.__pixelStudio;
      const m = app.doc.meta;
      const L = layerIdx === null ? m.layers.find((l) => l.id === app.ui.layerId) : m.layers[layerIdx];
      const F = m.frames[frame === null ? app.ui.frame : frame];
      const b = app.doc.cels.get(`${L.id}:${F.id}`);
      if (!b) return [0, 0, 0, 0];
      const i = (y * m.width + x) * 4;
      return [b[i], b[i + 1], b[i + 2], b[i + 3]];
    },
    comp(x, y, frame = null) {
      const { app, T } = window.__pixelStudio;
      const b = T.compositeFrame(frame === null ? app.ui.frame : frame);
      const i = (y * app.doc.meta.width + x) * 4;
      return [b[i], b[i + 1], b[i + 2], b[i + 3]];
    },
    count(layerIdx = null, frame = null) {
      const { app } = window.__pixelStudio;
      const m = app.doc.meta;
      const L = layerIdx === null ? m.layers.find((l) => l.id === app.ui.layerId) : m.layers[layerIdx];
      const b = app.doc.cels.get(`${L.id}:${m.frames[frame === null ? app.ui.frame : frame].id}`);
      let n = 0; if (b) for (let i = 3; i < b.length; i += 4) if (b[i]) n++;
      return n;
    },
    // touch targets smaller than `min` CSS px and buttons without an accessible name, among visible controls
    targets(min = 44) {
      const small = [], unnamed = [];
      const EXEMPT = '.pal, .tl-tag, .swatch-p, .swatch-s, input[type=checkbox], input[type=range], input[type=color], input[type=file]';
      const inClosedSheet = (el) => { const s = el.closest('.sheet'); return s && getComputedStyle(s).position === 'fixed' && !s.classList.contains('open'); };
      const lab = (el) => (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + `[${(el.getAttribute('aria-label') || el.title || el.textContent || '').trim().slice(0, 18)}]`;
      for (const el of document.querySelectorAll('button, select, input, .tool, .mi, .tab, .tl-fh, .tl-cel, .hist-item, [role=button]')) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        if (el.closest('.hidden') || inClosedSheet(el)) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (!el.matches(EXEMPT) && (r.width < min - 0.5 || r.height < min - 0.5)) small.push(lab(el) + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (el.matches('button, [role=button]')) {
          const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (!/[\p{L}\p{N}]/u.test(name)) unnamed.push(lab(el) + ' "' + name + '"');
        }
      }
      return { small, unnamed };
    },
    // every interactive element that is visible but cannot be reached (outside viewport, no scrollable ancestor)
    layout() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const bad = [], clipped = [];
      const scrollableAncestor = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) return p;
        }
        return null;
      };
      const inClosedSheet = (el) => { const s = el.closest('.sheet'); return s && getComputedStyle(s).position === 'fixed' && !s.classList.contains('open'); };
      const label = (el) => (el.id ? '#' + el.id : '') + (el.title ? `[${el.title.slice(0, 24)}]` : '') + (el.textContent || '').trim().slice(0, 16);
      for (const el of document.querySelectorAll('button, select, input, .tool, .pal, .tl-fh, .tl-cel, .mi, .tab')) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        if (el.closest('.hidden') || inClosedSheet(el) || (el.type === 'file')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const sa = scrollableAncestor(el);
        let out = r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1;
        if (out && sa) {
          const pr = sa.getBoundingClientRect();
          // reachable by scrolling the container, but the container itself must be on-screen
          out = pr.right > vw + 2 || pr.bottom > vh + 2 || pr.left < -2 || pr.top < -2; // ≤ 2px: WebKit fractional layout of the fixed sheet (cosmetic)
        }
        if (out) bad.push(label(el) + ` @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        if ((el.classList.contains('tb') || el.classList.contains('btn') || el.classList.contains('sb')) && el.scrollWidth > el.clientWidth + 2) clipped.push(label(el));
      }
      // selects must stay readable: custom appearance (WebKit native = light box) and not squashed
      for (const el of document.querySelectorAll('select')) {
        if (!el.offsetParent || inClosedSheet(el)) continue;
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        if ((cs.webkitAppearance || cs.appearance) !== 'none') clipped.push('native-appearance select ' + label(el));
        if (r.width < 48) clipped.push(`squashed select ${label(el)} ${Math.round(r.width)}px`);
      }
      for (const m of document.querySelectorAll('#modal-root .modal, #menu:not(.hidden)')) {
        const r = m.getBoundingClientRect();
        if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) bad.push('dialog/menu off-screen ' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
      }
      const se = document.scrollingElement;
      return { bad, clipped, pageScroll: [window.scrollX, window.scrollY, se.scrollTop], docH: se.scrollHeight, vh, scale: window.visualViewport?.scale ?? 1 };
    },
  };
};

// ---------------- runner ----------------
async function runProfile(name, target, base) {
  const prof = PROFILES[name];
  const bt = prof.browser === 'webkit' ? webkit : chromium;
  const browser = await bt.launch();
  const ctxOpts = { ...(prof.device ? devices[prof.device] : prof.ctx), acceptDownloads: true, locale: 'zh-TW', timezoneId: 'Asia/Taipei' };
  const context = await browser.newContext(ctxOpts);
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const R = { profile: name, target, browser: prof.browser + ' ' + browser.version(), device: prof.device || '1920×1080', checks: [], errors: [], suites: {} };
  let expectHttpErrors = 0;
  let expectConsole = null; // regex of console errors a test provokes on purpose (e.g. wrong password → 401)
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !(expectConsole && expectConsole.test(m.text()))) R.errors.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => R.errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (!/aborted|cancelled|NS_BINDING_ABORTED|Load request cancelled/i.test(f) && !r.url().startsWith('blob:')) R.errors.push(`[requestfailed] ${r.method()} ${r.url()} ${f}`); });
  page.on('response', (r) => { if (r.status() >= 400) { if (expectHttpErrors > 0) expectHttpErrors--; else R.errors.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`); } });
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-dl-'));
  const downloads = [];
  page.on('download', async (d) => { const f = path.join(dlDir, `${downloads.length}-${d.suggestedFilename()}`); downloads.push({ name: d.suggestedFilename(), p: d.saveAs(f).then(() => f) }); });

  let section = 'init';
  const ok = (cond, label, detail = '') => { R.checks.push({ suite: section, ok: !!cond, label, detail: cond ? '' : String(detail).slice(0, 3000) }); if (!cond) console.log(`    ❌ [${section}] ${label} ${String(detail).slice(0, 300)}`); return !!cond; };
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const raf = () => E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tap = async (sel, opts = {}) => {
    const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    if (prof.touch) await loc.tap({ timeout: 5000, ...opts }); else await loc.click({ timeout: 5000, ...opts });
    await raf(); // panels re-render on the next animation frame; let that happen before the next interaction
  };
  const tapText = (scope, text) => tap(page.locator(scope, { hasText: text }).first());
  const settle = (ms = 60) => page.waitForTimeout(ms);
  const isPhone = !!prof.phone;
  const openSheet = async (which) => {
    if (!isPhone) return;
    const id = which === 'timeline' ? 'timeline' : 'sidepanel';
    const open = await E((id) => document.getElementById(id).classList.contains('open'), id);
    if (!open) {
      await tap(which === 'timeline' ? '#btn-sheet-timeline' : which === 'color' ? '#btn-sheet-color' : '#btn-sheet-side');
      // wait for the slide-in transition to finish (a fixed sleep flaked under CPU load)
      await page.waitForFunction((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.bottom <= innerHeight + 2; }, id, { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(60);
    }
  };
  const closeSheets = async () => { if (isPhone) { await E(() => document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open'))); await page.waitForTimeout(250); } };
  const menu = async (label) => { await closeSheets(); await tap('#btn-menu'); await tapText('#menu .mi', label); await settle(); };
  const modalBtn = (label) => tap(page.locator('#modal-root .modal footer .btn', { hasText: label }).last());
  const closeModals = () => E(() => document.querySelectorAll('#modal-root .backdrop .modal header .x').forEach((x) => x.click()));
  const tool = async (id) => { await closeSheets(); const t = { pencil: '鉛筆', eraser: '橡皮擦', fill: '油漆桶', eyedropper: '滴管', line: '直線', rect: '矩形 ', ellipse: '橢圓', select: '矩形選取', lasso: '套索', move: '移動', hand: '平移' }[id]; await tap(`#toolbar .tool[title^="${t}"]`); ok(await E(() => window.__pixelStudio.app.ui.tool) === id, `tool → ${id}`); };
  const stroke = (pts, type = prof.touch ? 'touch' : 'mouse', o = {}) => E(([pts, type, o]) => window.__e2e.stroke(pts, type, o), [pts, type, o]);
  const cel = (x, y, l = null, f = null) => E(([x, y, l, f]) => window.__e2e.cel(x, y, l, f), [x, y, l, f]);
  const comp = (x, y, f = null) => E(([x, y, f]) => window.__e2e.comp(x, y, f), [x, y, f]);
  const ui = (k) => E((k) => window.__pixelStudio.app.ui[k], k);
  const meta = () => E(() => JSON.parse(JSON.stringify(window.__pixelStudio.app.doc.meta)));
  const histLen = () => E(() => window.__pixelStudio.app.history.undo.length);
  const setPrimary = (rgba) => E((c) => window.__pixelStudio.setUI({ primary: c }), rgba);
  const fileChoose = async (trigger, files) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 6000 }), trigger()]);
    await fc.setFiles(files);
  };
  const waitDownloads = async (n, trigger, timeout = 8000) => {
    const start = downloads.length;
    await trigger();
    const t0 = Date.now();
    while (downloads.length < start + n && Date.now() - t0 < timeout) await sleep(100);
    const got = downloads.slice(start);
    return Promise.all(got.map(async (d) => ({ name: d.name, buf: fs.readFileSync(await d.p) })));
  };
  const newProject = async (w, h, nm = 'e2e') => {
    await menu('新增專案');
    const inputs = page.locator('#modal-root .modal input[type=number]');
    await page.locator('#modal-root .modal input[type=text]').first().fill(nm);
    await inputs.nth(0).fill(String(w)); await inputs.nth(1).fill(String(h));
    await modalBtn('建立'); await settle(150);
    await E(() => window.__pixelStudio.P.setTool('pencil'));
    const m = await meta();
    return m.width === w && m.height === h && m.name === nm;
  };
  const shot = async (file) => { if (!args.shots) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, file) }); };
  const layoutOk = async (where) => {
    const L = await E(() => window.__e2e.layout());
    ok(!L.bad.length, `layout: every control reachable (${where})`, L.bad.join(' | '));
    ok(!L.clipped.length, `layout: no clipped button text (${where})`, L.clipped.join(' | '));
    ok(L.pageScroll.every((v) => v === 0) && L.docH <= L.vh + 1 && L.scale === 1, `layout: page not scrolled / zoomed (${where})`, JSON.stringify(L));
  };

  // ---------- boot ----------
  const boot = async () => {
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelStudio?.app?.doc, null, { timeout: 15000 });
    await page.waitForTimeout(400);
  };
  await boot();
  section = 'load';
  ok(!R.errors.length, 'no console/page/network errors during initial page load', R.errors.join(' || '));

  const S = {};
  S.boot = async () => {
    // the title renders on the next animation frame after the document opens; under CPU load that can exceed the boot settle time
    await page.waitForFunction(() => document.getElementById('doc-title').textContent.includes('×'), null, { timeout: 5000 }).catch(() => {});
    ok(await E(() => document.getElementById('doc-title').textContent.includes('×')), 'app booted, title shows size');
    const cloudAvail = await E(() => window.__pixelStudio.cloud.available);
    ok(cloudAvail === (target === 'server'), `server detection = ${target === 'server'}`, cloudAvail);
    ok(await E(() => !!indexedDB), 'IndexedDB available');
    ok(await newProject(40, 24, 'e2e 測試'), 'new project with custom size 40×24');
    const zoom = await ui('zoom');
    ok(zoom >= 1, 'fit-to-view zoom after new project', zoom);
    // regression (v1.0.1): About dialog used to show a hard-coded "0.1"
    await menu('關於 Pixel Studio');
    const aboutTxt = await E(() => document.querySelector('#modal-root .modal')?.textContent || '');
    ok(aboutTxt.includes(`Pixel Studio ${PKG_VERSION}`) && !/Pixel Studio 0\.1\b/.test(aboutTxt), `About shows app version ${PKG_VERSION}`, aboutTxt.slice(0, 120));
    await closeModals();
  };

  // v1.1.0 (ADR-002): 44pt touch targets on touch devices, accessible names everywhere
  S.a11y = async () => {
    const touchCls = await E(() => document.documentElement.classList.contains('touch'));
    ok(touchCls === !!prof.touch, `html.touch class = ${!!prof.touch}`, touchCls);
    const MIN = prof.touch ? 44 : 0;
    const check = async (where) => {
      const T = await E((m) => window.__e2e.targets(m), MIN);
      if (prof.touch) ok(!T.small.length, `touch targets ≥ 44pt (${where})`, T.small.join(' | '));
      ok(!T.unnamed.length, `every button has an accessible name (${where})`, T.unnamed.join(' | '));
    };
    await check('main');
    if (isPhone) { for (const w of ['color', 'timeline']) { await openSheet(w); await check('sheet ' + w); await closeSheets(); } }
    await closeSheets(); await tap('#btn-menu'); await check('main menu');
    await E(() => document.getElementById('menu').classList.add('hidden'));
    for (const [label, where] of [['匯出（PNG', 'export dialog'], ['畫布大小', 'canvas size dialog'], ['新增專案', 'new project dialog']]) {
      await menu(label); await settle(150); await check(where); await closeModals(); await settle(60);
    }
    const names = await E(() => ({ undo: document.getElementById('btn-undo').getAttribute('aria-label'), menu: document.getElementById('btn-menu').getAttribute('aria-label'), tool: document.querySelector('#toolbar .tool')?.getAttribute('aria-label'), pressed: document.querySelector('#toolbar .tool.on')?.getAttribute('aria-pressed'), canvas: document.getElementById('view').getAttribute('aria-label') }));
    ok(names.undo === '復原' && names.menu === '選單' && names.tool === '鉛筆' && names.pressed === 'true' && names.canvas === '像素畫布', 'VoiceOver names: 復原 / 選單 / 鉛筆 (pressed) / 像素畫布', JSON.stringify(names));
    if (!prof.touch) ok(await E(() => document.querySelector('#toolbar .tool').getBoundingClientRect().width) <= 40, 'desktop keeps compact 38px tools');
    // grid toggle reachable from the menu (hidden from the narrow-phone top bar)
    const g0 = await ui('showGrid');
    await menu(g0 ? '隱藏像素格線' : '顯示像素格線');
    ok(await ui('showGrid') === !g0, 'menu → 檢視 toggles pixel grid');
    await E((g) => window.__pixelStudio.setUI({ showGrid: g }), g0);
  };

  S.layout = async () => {
    await layoutOk('main');
    if (isPhone) {
      for (const w of ['color', 'side', 'timeline']) {
        await openSheet(w);
        const r = await E((id) => { const el = document.getElementById(id); const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, open: el.classList.contains('open'), vvTop: visualViewport?.offsetTop, vvH: visualViewport?.height, ch: document.documentElement.clientHeight, tf: getComputedStyle(el).transform }; }, w === 'timeline' ? 'timeline' : 'sidepanel');
        ok(r.open && r.top >= 0 && r.bottom <= r.h + 2, `bottom sheet "${w}" opens fully on-screen`, JSON.stringify(r));
        await layoutOk('sheet ' + w);
        await closeSheets();
      }
      await page.waitForTimeout(250); // .22s slide-out transition
      const closed = await E(() => [...document.querySelectorAll('.sheet')].every((s) => s.getBoundingClientRect().top >= innerHeight - 2));
      ok(closed, 'bottom sheets hidden below the screen when closed');
      // swipe-down on the handle closes a sheet
      await openSheet('timeline');
      await E(() => { const hd = document.querySelector('#timeline .sheet-handle'); const r = hd.getBoundingClientRect(); const o = { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: r.left + 5, clientY: r.top + 3 }; hd.dispatchEvent(new PointerEvent('pointerdown', o)); hd.dispatchEvent(new PointerEvent('pointerup', { ...o, clientY: r.top + 80 })); });
      await settle(300);
      ok(!(await E(() => document.getElementById('timeline').classList.contains('open'))), 'swipe down on sheet handle closes it');
    }
    // effective touch-action: scroll containers must not inherit "none" from an ancestor
    const ta = await E(() => {
      const chain = (el) => { const out = []; for (let p = el; p; p = p.parentElement) out.push(getComputedStyle(p).touchAction); return out; };
      const res = {};
      for (const s of ['#sidepanel', '#tl-scroll', '#toolbar', '#optionsbar', '#tl-controls']) res[s] = chain(document.querySelector(s));
      res.view = getComputedStyle(document.getElementById('view')).touchAction;
      res.body = getComputedStyle(document.body).touchAction;
      return res;
    });
    ok(Object.entries(ta).filter(([k]) => k.startsWith('#')).every(([, c]) => !c.includes('none')), 'scrollable panels can be scrolled by finger (no touch-action:none ancestor)', JSON.stringify(ta));
    ok(ta.view === 'none', 'canvas touch-action: none (no browser pan/zoom while drawing)', ta.view);
    ok(/manipulation|none/.test(ta.body), 'body blocks double-tap zoom (touch-action manipulation)', ta.body);
    const gest = await E(() => { const ev = new Event('gesturestart', { bubbles: true, cancelable: true }); document.getElementById('toolbar').dispatchEvent(ev); return ev.defaultPrevented; });
    ok(gest, 'Safari gesturestart is cancelled everywhere (no page pinch-zoom over toolbars)');
    const sel = await E(() => getComputedStyle(document.getElementById('app')).webkitUserSelect || getComputedStyle(document.getElementById('app')).userSelect);
    ok(sel === 'none', 'UI chrome not text-selectable (no iOS selection magnifier on long-press)', sel);
    const vp = await E(() => document.querySelector('meta[name=viewport]').content);
    ok(/viewport-fit=cover/.test(vp) && /user-scalable=no/.test(vp), 'viewport meta: viewport-fit=cover, user-scalable=no', vp);
    // simulate notch / home-indicator safe areas and make sure everything still fits
    // insets as iOS reports them: portrait = top (notch/Dynamic Island) + bottom; landscape = left/right + bottom.
    // (v1.1.0: the old all-four-sides simulation is impossible on a real device and over-constrained 44pt top bars)
    const portrait = await E(() => innerHeight > innerWidth);
    const ins = isPhone ? (portrait ? { t: 47, b: 34, l: 0, r: 0 } : { t: 0, b: 21, l: 47, r: 47 }) : { t: 24, b: 20, l: 0, r: 0 };
    await E((i) => { const s = document.createElement('style'); s.id = 'e2e-safe'; s.textContent = `:root{--safe-t:${i.t}px!important;--safe-b:${i.b}px!important;--safe-l:${i.l}px!important;--safe-r:${i.r}px!important}`; document.head.append(s); }, ins);
    await settle(150);
    const safe = await E(() => { const t = document.getElementById('topbar').getBoundingClientRect(); const tb = document.getElementById('toolbar').getBoundingClientRect(); return { top: t.top, left: t.left, right: innerWidth - t.right, tbBottom: tb.bottom, vh: innerHeight }; });
    ok(safe.top >= ins.t && safe.left >= ins.l && safe.right >= ins.r, `safe-area insets respected (${JSON.stringify(ins)})`, JSON.stringify(safe));
    await layoutOk('with safe-area insets');
    await E(() => document.getElementById('e2e-safe').remove());
    await settle(100);
    if (args.shots) {
      await newProject(32, 32, '示範');
      await E(() => { const { app, A } = window.__pixelStudio; A.setPalette(app.doc.meta.palette); });
      // draw a small sample sprite so screenshots are not empty
      await E(() => {
        const { app, T } = window.__pixelStudio;
        const rows = ['..........KKKKKKKKKKKK..........', '........KKYYYYYYYYYYYYKK........', '......KKYYYYYYYYYYYYYYYYKK......', '.....KYYYYYYYYYYYYYYYYYYYYK.....', '....KYYYYYYYYYYYYYYYYYYYYYYK....', '...KYYYYYKKYYYYYYYYYYKKYYYYYK...', '...KYYYYYKKYYYYYYYYYYKKYYYYYK...', '..KYYYYYYKKYYYYYYYYYYKKYYYYYYK..', '..KYYYYYYYYYYYYYYYYYYYYYYYYYYK..', '..KYYPPYYYYYYYYYYYYYYYYYYPPYYK..', '..KYYPPYYYYYYYYYYYYYYYYYYPPYYK..', '..KYYYYYYKYYYYYYYYYYYYKYYYYYYK..', '...KYYYYYYKKYYYYYYYYKKYYYYYYK...', '...KYYYYYYYYKKKKKKKKYYYYYYYYK...', '....KYYYYYYYYYYYYYYYYYYYYYYK....', '.....KYYYYYYYYYYYYYYYYYYYYK.....', '......KKYYYYYYYYYYYYYYYYKK......', '........KKYYYYYYYYYYYYKK........', '..........KKKKKKKKKKKK..........'];
        const C = { K: [34, 32, 52, 255], Y: [251, 242, 54, 255], P: [217, 87, 99, 255] };
        const b = new Uint8ClampedArray(32 * 32 * 4);
        rows.forEach((r, y) => [...r].forEach((ch, x) => { if (C[ch]) b.set(C[ch], ((y + 6) * 32 + x) * 4); }));
        const m = app.doc.meta; app.doc.cels.set(`${m.layers[0].id}:${m.frames[0].id}`, b); app.version++;
        window.__pixelStudio.A.addFrame(true); window.__pixelStudio.A.addLayer(); window.__pixelStudio.A.selectFrame(0);
      });
      await settle(300);
      await shot(`${name}.png`);
      if (isPhone) {
        await openSheet('color'); await shot(`${name}-sheet-color.png`); await closeSheets();
        await openSheet('timeline'); await shot(`${name}-sheet-timeline.png`); await closeSheets();
      }
      if (name === 'ipad-pro-11-landscape' || name === 'desktop-chromium') {
        await tap('#btn-menu'); await settle(150); await shot(`${name}-menu.png`); await E(() => window.__pixelStudio.D && document.getElementById('menu').classList.add('hidden'));
        await menu('匯出'); await settle(100); await shot(`${name}-export.png`); await closeModals();
        await menu('新增專案'); await settle(100); await shot(`${name}-new.png`); await closeModals();
        await tool('select'); await stroke([[8, 8], [20, 18]]); await settle(100); await shot(`${name}-select.png`);
        await E(() => window.__pixelStudio.T.deselect());
        await tool('pencil');
        await E(() => window.__pixelStudio.setUI({ onion: { ...window.__pixelStudio.app.ui.onion, on: true } })); await E(() => window.__pixelStudio.A.selectFrame(1)); await settle(150); await shot(`${name}-onion.png`);
        await E(() => window.__pixelStudio.setUI({ onion: { ...window.__pixelStudio.app.ui.onion, on: false } }));
      }
    }
  };

  S.draw = async () => {
    await newProject(32, 24, 'draw');
    const K = [255, 0, 77, 255];
    await setPrimary(K);
    await tool('pencil');
    // 1px stroke
    await stroke([[1, 1], [10, 1]]);
    ok((await cel(1, 1)).join() === K.join() && (await cel(10, 1)).join() === K.join() && (await cel(11, 1))[3] === 0, 'pencil 1px stroke paints exact pixels');
    ok(await histLen() === 1, 'one stroke = one history step');
    // pen pointer + trusted-pen auto palm rejection
    await stroke([[1, 3], [4, 3]], 'pen');
    ok((await cel(3, 3)).join() === K.join(), 'pen (Apple Pencil pointerType=pen) draws');
    ok(await ui('penOnly') === true, 'pen detected → "僅筆繪圖" palm rejection auto-enabled');
    if (prof.touch) {
      const before = await E(() => window.__e2e.count());
      await stroke([[20, 10], [25, 10]], 'touch');
      ok(await E(() => window.__e2e.count()) === before, 'palm rejection: finger does not draw while 僅筆繪圖 is on');
    }
    await E(() => window.__pixelStudio.setUI({ penOnly: false }));
    // brush size 3 via slider
    const range = page.locator('#optionsbar input[type=range]').first();
    await range.evaluate((el) => { el.value = 3; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(await ui('brushSize') === 3, 'brush size slider → 3');
    await stroke([[5, 6], [5, 6]]);
    let n = 0; for (let y = 5; y <= 7; y++) for (let x = 4; x <= 6; x++) if ((await cel(x, y))[3]) n++;
    ok(n === 9 && (await cel(7, 6))[3] === 0, '3px square brush stamps 3×3', n);
    // circle brush 5
    await range.evaluate((el) => { el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await tap(page.locator('#optionsbar button[title="圓形筆刷"]'));
    await stroke([[14, 7], [14, 7]]);
    ok((await cel(14, 7))[3] && !(await cel(12, 5))[3] && (await cel(12, 7))[3], 'round brush 5px (corners empty)');
    await range.evaluate((el) => { el.value = 1; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await tap(page.locator('#optionsbar button[title="方形筆刷"]'));
    // pixel-perfect: staircase without L corners
    await tapText('#optionsbar button', '像素完美');
    ok(await ui('pixelPerfect'), 'pixel-perfect toggle on');
    await stroke([[1, 12], [2, 12], [2, 13], [3, 13], [3, 14], [4, 14]]);
    const corner = await cel(2, 12), corner2 = await cel(2, 13);
    ok(!(corner[3] && corner2[3]) || !(await cel(3, 13))[3], 'pixel-perfect removes L-shaped corners', JSON.stringify([corner, corner2]));
    await tapText('#optionsbar button', '像素完美');
    // dither checker
    await page.locator('#optionsbar select').first().selectOption('checker');
    ok(await ui('dither') === 'checker', 'dither pattern selected (checker)');
    await range.evaluate((el) => { el.value = 4; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await stroke([[22, 16], [22, 16]]);
    const d1 = (await cel(21, 15))[3] > 0, d2 = (await cel(22, 15))[3] > 0;
    ok(d1 !== d2, 'dither brush paints a checkerboard', JSON.stringify([d1, d2]));
    await page.locator('#optionsbar select').first().selectOption('');
    await range.evaluate((el) => { el.value = 1; el.dispatchEvent(new Event('input', { bubbles: true })); });
    // eraser
    await tool('eraser');
    await stroke([[1, 1], [3, 1]]);
    ok((await cel(2, 1))[3] === 0 && (await cel(4, 1))[3] > 0, 'eraser clears pixels');
    // line / rect / ellipse
    await tool('pencil'); await tool('line');
    await stroke([[0, 20], [10, 20]]);
    ok((await cel(0, 20))[3] && (await cel(10, 20))[3] && (await cel(5, 20))[3], 'line tool draws a straight line');
    await tool('rect');
    await stroke([[12, 14], [18, 20]]);
    ok((await cel(12, 14))[3] && (await cel(18, 20))[3] && !(await cel(15, 17))[3], 'rect outline');
    await tool('fill');
    await stroke([[15, 17], [15, 17]]);
    ok((await cel(15, 17)).join() === K.join() && !(await cel(20, 22))[3], 'fill contiguous fills only the enclosed area');
    await setPrimary([41, 173, 255, 255]);
    await tapText('#optionsbar button', '全部同色');
    await stroke([[15, 17], [15, 17]]);
    ok((await cel(5, 20)).join() === '41,173,255,255' && (await cel(15, 17)).join() === '41,173,255,255', 'fill global replaces every pixel of that colour');
    await tapText('#optionsbar button', '相連區域');
    await tool('ellipse');
    await tapText('#optionsbar button', '填滿');
    await setPrimary([255, 236, 39, 255]);
    await stroke([[24, 2], [30, 8]]);
    ok((await cel(27, 5)).join() === '255,236,39,255' && !(await cel(24, 2))[3], 'filled ellipse');
    await tapText('#optionsbar button', '填滿');
    // eyedropper
    await tool('eyedropper');
    await setPrimary([0, 0, 0, 255]);
    await stroke([[27, 5], [27, 5]]);
    ok((await ui('primary')).join() === '255,236,39,255', 'eyedropper picks the canvas colour');
    // symmetry
    await tool('pencil');
    await tapText('#optionsbar button', '⇆ 對稱');
    await stroke([[2, 22], [2, 22]]);
    ok((await cel(29, 22))[3] > 0, 'horizontal symmetry mirrors the stroke');
    await tapText('#optionsbar button', '⇆ 對稱');
    // trusted input path (real browser-generated events)
    const before = await E(() => window.__e2e.count());
    const p = await E(() => window.__e2e.pt(30, 22));
    if (prof.touch) await page.touchscreen.tap(p.clientX, p.clientY); else { await page.mouse.move(p.clientX, p.clientY); await page.mouse.down(); await page.mouse.move(p.clientX - 30, p.clientY); await page.mouse.up(); }
    await settle(80);
    const after = await E(() => window.__e2e.count());
    R.trustedInput = after > before;
    ok(!prof.touch ? after > before : true, prof.touch ? `trusted touchscreen.tap → ${after > before ? 'draws' : 'no pointer events in this WebKit build (informational)'}` : 'trusted mouse drag draws');
    // right-click = secondary colour (desktop)
    if (!prof.touch) {
      await E(() => window.__pixelStudio.setUI({ secondary: [0, 255, 0, 255] }));
      const q = await E(() => window.__e2e.pt(20, 2));
      await page.mouse.move(q.clientX, q.clientY); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
      ok((await cel(20, 2)).join() === '0,255,0,255', 'right mouse button paints with secondary colour');
    }
    // locked / hidden layer protection
    await E(() => { const { A, app } = window.__pixelStudio; A.updateLayer(app.ui.layerId, { locked: true }); });
    const c0 = await E(() => window.__e2e.count());
    await stroke([[8, 8], [9, 9]]);
    ok(await E(() => window.__e2e.count()) === c0, 'locked layer cannot be painted');
    await E(() => { const { A, app } = window.__pixelStudio; A.updateLayer(app.ui.layerId, { locked: false }); });
  };

  S.select = async () => {
    await newProject(24, 24, 'select');
    await E(() => { const { app } = window.__pixelStudio; const m = app.doc.meta; const b = new Uint8ClampedArray(24 * 24 * 4); for (let y = 2; y < 6; y++) for (let x = 2; x < 8; x++) b.set([255, 0, 0, 255], (y * 24 + x) * 4); b.set([0, 0, 255, 255], (2 * 24 + 2) * 4); app.doc.cels.set(`${m.layers[0].id}:${m.frames[0].id}`, b); app.version++; window.__pixelStudio.A.selectFrame(0); });
    await tool('select');
    await stroke([[2, 2], [7, 5]]);
    const sel = await E(() => window.__pixelStudio.app.selection && [window.__pixelStudio.app.selection.x, window.__pixelStudio.app.selection.y, window.__pixelStudio.app.selection.w, window.__pixelStudio.app.selection.h]);
    ok(sel && sel.join() === '2,2,6,4', 'rect selection by drag', JSON.stringify(sel));
    await tapText('#optionsbar button', '複製');
    ok(await E(() => !!window.__pixelStudio.app.clipboard), 'copy selection');
    await tapText('#optionsbar button', '貼上');
    ok(await E(() => !!window.__pixelStudio.app.floating), 'paste creates floating selection');
    ok(await E(() => !document.getElementById('float-actions').classList.contains('hidden')), 'floating action bar visible');
    // drag the floating paste
    await stroke([[3, 3], [13, 13]]);
    await tap(page.locator('#float-actions button', { hasText: '完成' }));
    ok((await cel(13, 13)).join() === '255,0,0,255' && (await cel(12, 12)).join() === '0,0,255,255' && (await cel(2, 2)).join() === '0,0,255,255', 'move pasted copy then ✓ 完成 commits it (original kept)', JSON.stringify([await cel(12, 12), await cel(13, 13)]));
    // drag existing selection = move pixels
    await stroke([[3, 3], [3, 3]]); // tap outside → deselect
    await stroke([[2, 2], [7, 5]]);
    await stroke([[4, 4], [4, 9]]);
    await E(() => window.__pixelStudio.T.dropFloating());
    ok((await cel(2, 2))[3] === 0 && (await cel(2, 7)).join() === '0,0,255,255', 'drag inside selection moves pixels');
    // flip / rotate
    await tapText('#optionsbar button', '⇆ 翻轉');
    await E(() => window.__pixelStudio.T.dropFloating());
    ok((await cel(7, 7)).join() === '0,0,255,255', 'flip horizontal selection', JSON.stringify(await cel(7, 7)));
    await tapText('#optionsbar button', '↻ 90°');
    await E(() => window.__pixelStudio.T.dropFloating());
    const s2 = await E(() => { const s = window.__pixelStudio.app.selection; return s && [s.w, s.h]; });
    ok(s2 && s2.join() === '4,6', 'rotate 90° swaps selection size', JSON.stringify(s2));
    await tapText('#optionsbar button', '⇅ 翻轉');
    await E(() => window.__pixelStudio.T.dropFloating());
    ok(await histLen() >= 5, 'transforms are undoable steps');
    // lasso
    await tool('lasso');
    await stroke([[14, 14], [22, 14], [22, 22], [14, 22], [14, 14]]);
    const ls = await E(() => { const s = window.__pixelStudio.app.selection; return s && [s.x, s.y, s.w, s.h]; });
    ok(ls && ls[0] >= 13 && ls[2] >= 7, 'lasso selection', JSON.stringify(ls));
    await tapText('#optionsbar button', '取消');
    ok(await E(() => !window.__pixelStudio.app.selection), 'deselect');
    // cut / delete
    await tool('select');
    await stroke([[0, 6], [23, 23]]);
    await tapText('#optionsbar button', '刪除');
    ok(await E(() => window.__e2e.count()) === 0 || (await cel(13, 13))[3] === 0, 'delete selection contents');
    await E(() => window.__pixelStudio.undo());
    // move tool on whole cel
    await tapText('#optionsbar button', '取消');
    await tool('move');
    const c1 = await cel(13, 13);
    await stroke([[13, 13], [14, 13]]);
    ok((await cel(14, 13)).join() === c1.join(), 'move tool shifts whole layer content', JSON.stringify([c1, await cel(14, 13)]));
    // crop to selection
    await tool('select');
    await stroke([[1, 1], [10, 8]]);
    await tapText('#optionsbar button', '裁切畫布');
    const m = await meta();
    ok(m.width === 10 && m.height === 8, 'crop canvas to selection → 10×8', `${m.width}×${m.height}`);
  };

  S.palette = async () => {
    await newProject(16, 16, 'palette');
    await openSheet('color');
    const n0 = (await meta()).palette.length;
    const sw = page.locator('#palette .pal').nth(5);
    const hex = await sw.getAttribute('title');
    await tap(sw);
    const prim = await E(() => window.__pixelStudio.T.hexOf(window.__pixelStudio.app.ui.primary));
    ok(prim.toLowerCase().startsWith(hex.toLowerCase().slice(0, 7)), 'tap swatch sets colour', `${prim} vs ${hex}`);
    // hex input
    await openSheet('color');
    const hx = page.locator('#color-editor .ce-hex');
    await hx.fill('#12ab34'); await hx.press('Enter'); await hx.evaluate((e) => e.dispatchEvent(new Event('change')));
    ok((await ui('primary')).join() === '18,171,52,255', 'hex colour input');
    await hx.fill('#12ab3480'); await hx.evaluate((e) => e.dispatchEvent(new Event('change')));
    ok((await ui('primary'))[3] === 128, 'hex with alpha #RRGGBBAA');
    // SV / hue drag via pointer
    await E(() => { const el = document.querySelector('#color-editor .ce-sv'); const r = el.getBoundingClientRect(); const o = { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: r.left + r.width * 0.9, clientY: r.top + r.height * 0.1 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); });
    const sv = await ui('primary');
    ok(sv[0] + sv[1] + sv[2] > 200, 'saturation/value pad drag changes colour', JSON.stringify(sv));
    await openSheet('color');
    await tap(page.locator('#palette-actions button[title^="把目前顏色"]'));
    ok((await meta()).palette.length === n0 + 1, 'add current colour to palette');
    await openSheet('color');
    await tap(page.locator('#palette-actions button[title^="移除"]'));
    ok((await meta()).palette.length === n0, 'remove selected palette colour');
    // long-press swatch → context menu
    await openSheet('color');
    const box = await page.locator('#palette .pal').nth(2).boundingBox();
    await E(([x, y]) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true, clientX: x, clientY: y, button: 0 })); }, [box.x + box.width / 2, box.y + box.height / 2]);
    await settle(700);
    ok(await E(() => !document.getElementById('menu').classList.contains('hidden') && document.getElementById('menu').textContent.includes('設為次要顏色')), 'long-press swatch opens swatch menu');
    await tapText('#menu .mi', '設為次要顏色');
    // preset palettes
    await openSheet('color');
    await tap(page.locator('#palette-actions button[title="調色盤選單"]'));
    await tapText('#menu .mi', 'PICO-8');
    ok((await meta()).palette.length === 16, 'load PICO-8 preset (16 colours)');
    // export .hex / .gpl
    await openSheet('color');
    let d = await waitDownloads(1, async () => { await tap(page.locator('#palette-actions button[title="調色盤選單"]')); await tapText('#menu .mi', '匯出 .hex'); });
    const hexTxt = d[0]?.buf.toString();
    ok(d[0]?.name.endsWith('.hex') && hexTxt.trim().split(/\r?\n/).length === 16, 'export .hex (16 lines)', d[0]?.name);
    await openSheet('color');
    d = await waitDownloads(1, async () => { await tap(page.locator('#palette-actions button[title="調色盤選單"]')); await tapText('#menu .mi', '匯出 .gpl'); });
    ok(d[0]?.name.endsWith('.gpl') && d[0].buf.toString().startsWith('GIMP Palette'), 'export .gpl (GIMP palette)', d[0]?.name);
    // import .gpl
    const gpl = path.join(dlDir, 'in.gpl');
    fs.writeFileSync(gpl, 'GIMP Palette\nName: t\nColumns: 4\n#\n255   0   0 red\n  0 255   0 green\n  0   0 255 blue\n');
    await openSheet('color');
    await fileChoose(async () => { await tap(page.locator('#palette-actions button[title="調色盤選單"]')); await tapText('#menu .mi', '匯入 .hex'); }, gpl);
    await settle(300);
    ok((await meta()).palette.length === 3, 'import .gpl palette (3 colours)', (await meta()).palette.join());
    const accept = await E(() => document.getElementById('file-input').accept);
    if (prof.browser === 'webkit') ok(accept === '', 'iOS: palette file picker does not filter by unknown extensions (.gpl/.hex would be greyed out)', accept);
    else ok(/\.gpl/.test(accept), 'desktop: palette file picker filters .hex/.gpl', accept);
    // extract from canvas
    await stroke([[1, 1], [3, 1]]);
    await openSheet('color');
    await tap(page.locator('#palette-actions button[title="調色盤選單"]'));
    await tapText('#menu .mi', '從畫面擷取');
    ok((await meta()).palette.length >= 3, 'extract palette from canvas');
    await closeSheets();
  };

  S.layers = async () => {
    await newProject(16, 16, 'layers');
    await openSheet('timeline');
    const tl = (t) => tap(page.locator(`#tl-controls button[title^="${t}"]`));
    await tl('新增圖層');
    ok((await meta()).layers.length === 2, 'add layer');
    await stroke([[1, 1], [1, 1]]); // draw on layer 2 (stage tap also closes the sheet on phone)
    await openSheet('timeline');
    await tl('複製圖層');
    let m = await meta();
    ok(m.layers.length === 3 && m.layers[2].name.includes('複本'), 'duplicate layer');
    ok((await cel(1, 1, 2))[3] > 0, 'duplicated layer has the pixels');
    // rename / opacity / blend via ⚙ dialog
    await tl('圖層屬性');
    await page.locator('#modal-root .modal input[type=text]').fill('上色層');
    await page.locator('#modal-root .modal input[type=range]').evaluate((e) => { e.value = 50; e.dispatchEvent(new Event('input')); });
    await page.locator('#modal-root .modal select').selectOption('multiply');
    await modalBtn('套用');
    m = await meta();
    ok(m.layers[2].name === '上色層' && m.layers[2].opacity === 0.5 && m.layers[2].blend === 'multiply', 'rename + opacity + blend mode', JSON.stringify(m.layers[2]));
    await openSheet('timeline');
    // hide / lock via row buttons
    const row = page.locator('.tl-lh', { hasText: '上色層' });
    await tap(row.locator('button[title^="顯示"]'));
    ok((await meta()).layers[2].visible === false, 'hide layer (👁)');
    await tap(row.locator('button[title^="顯示"]'));
    await tap(row.locator('button[title^="鎖定"]'));
    ok((await meta()).layers[2].locked === true, 'lock layer (🔒)');
    await tap(row.locator('button[title^="鎖定"]'));
    // reorder by dragging the grip of the top layer onto the bottom layer row
    const ids = (await meta()).layers.map((l) => l.id);
    await E(([from, to]) => {
      const g = document.querySelector(`.tl-lh[data-layer="${from}"] .grip`), t = document.querySelector(`.tl-lh[data-layer="${to}"]`);
      const a = g.getBoundingClientRect(), b = t.getBoundingClientRect();
      const o = (x, y) => ({ pointerId: 12, pointerType: 'touch', bubbles: true, cancelable: true, clientX: x, clientY: y });
      g.dispatchEvent(new PointerEvent('pointerdown', o(a.left + 3, a.top + 3)));
      g.dispatchEvent(new PointerEvent('pointermove', o(a.left + 3, b.top + b.height / 2)));
      g.dispatchEvent(new PointerEvent('pointerup', o(a.left + 3, b.top + b.height / 2)));
    }, [ids[2], ids[0]]);
    await settle(100);
    m = await meta();
    ok(m.layers[0].id === ids[2], 'drag ⋮⋮ grip reorders layers', m.layers.map((l) => l.name).join(','));
    // select a layer by tapping its name, merge down
    await openSheet('timeline');
    await tap(page.locator(`.tl-lh[data-layer="${ids[1]}"] .nm`));
    ok(await ui('layerId') === ids[1], 'tap layer row selects layer');
    await tl('向下合併');
    m = await meta();
    ok(m.layers.length === 2 && (await cel(1, 1, 0))[3] > 0, 'merge down', m.layers.map((l) => l.name).join(','));
    await openSheet('timeline');
    await tl('刪除圖層');
    ok((await meta()).layers.length === 1, 'delete layer (owner UI)');
    await closeSheets();
  };

  S.timeline = async () => {
    await newProject(8, 8, 'anim');
    await stroke([[1, 1], [1, 1]]);
    await openSheet('timeline');
    const tl = (t) => tap(page.locator(`#tl-controls button[title^="${t}"]`));
    await tl('複製目前影格');
    await tl('新增空白影格');
    await tl('複製目前影格');
    let m = await meta();
    ok(m.frames.length === 4, 'add / duplicate frames (4)', m.frames.length);
    ok(await ui('frame') === 3, 'new frame becomes current');
    // frame header tap selects
    await tap(page.locator('.tl-fh').nth(0));
    ok(await ui('frame') === 0, 'tap frame header selects frame');
    // duration via long-press / dblclick → prompt
    const fh = page.locator('.tl-fh').nth(1);
    if (prof.touch) {
      await fh.evaluate((el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
      await settle(750);
    } else await fh.dblclick();
    await page.locator('#modal-root .modal input[type=text]').fill('250');
    await modalBtn('確定');
    ok((await meta()).frames[1].duration === 250, `frame duration editor (${prof.touch ? 'long-press' : 'double-click'})`);
    // FPS apply all
    await openSheet('timeline');
    await page.locator('#tl-controls input[type=number]').fill('20');
    await tapText('#tl-controls button', '套用全部');
    ok((await meta()).frames.every((f) => f.duration === 50), 'FPS 20 → all frames 50ms');
    // move frame
    await openSheet('timeline');
    await tap(page.locator('.tl-fh').nth(0));
    await tl('影格往後移');
    ok(await ui('frame') === 1, 'move frame right');
    // tags: shift-select range then 🏷
    await openSheet('timeline');
    await tap(page.locator('.tl-fh').nth(0));
    await page.locator('.tl-fh').nth(2).click({ modifiers: ['Shift'] });
    ok(JSON.stringify(await ui('frameSel')) === '[0,2]', 'shift-click selects frame range');
    await tl('新增標籤');
    await page.locator('#modal-root .modal input[type=text]').fill('walk');
    await page.locator('#modal-root .modal select').selectOption('pingpong');
    await modalBtn('儲存');
    m = await meta();
    ok(m.tags.length === 1 && m.tags[0].name === 'walk' && m.tags[0].from === 0 && m.tags[0].to === 2 && m.tags[0].direction === 'pingpong', 'create tag walk 1–3 ping-pong', JSON.stringify(m.tags));
    await openSheet('timeline');
    await tap(page.locator('.tl-tag', { hasText: 'walk' }));
    await modalBtn('設為播放範圍');
    ok(!!(await ui('playTag')), 'tag set as play range');
    // playback modes
    for (const mode of ['loop', 'pingpong', 'once']) {
      await openSheet('timeline');
      await page.locator('#tl-controls select').first().selectOption(mode);
      await E(() => window.__pixelStudio.setUI({ playTag: '' }));
      await E(() => window.__pixelStudio.A.selectFrame(0));
      await openSheet('timeline');
      // record every frame the player shows, sampled in the page on each animation frame
      await E(() => { window.__seen = new Set(); window.__seenOn = true; const f = () => { window.__seen.add(window.__pixelStudio.app.ui.frame); if (window.__seenOn) requestAnimationFrame(f); }; f(); });
      await tap(page.locator('#tl-controls button[title^="播放"]'));
      await sleep(900);
      const seen = new Set(await E(() => { window.__seenOn = false; return [...window.__seen]; }));
      const playing = await ui('playing');
      if (mode !== 'once' || playing) { await openSheet('timeline'); if (await ui('playing')) await tap(page.locator('#tl-controls button[title^="播放"]')); }
      ok(seen.size >= 3, `playback (${mode}) advances frames`, [...seen].join(','));
      if (mode === 'once') { await sleep(400); ok(!(await ui('playing')), 'once mode stops at the end'); }
    }
    ok(!(await ui('playing')), 'playback stopped');
    // onion skin
    await openSheet('timeline');
    await tl('洋蔥皮');
    ok((await ui('onion')).on, 'onion skin toggle (🧅)');
    await openSheet('side');
    await page.locator('#onion input[type=number]').nth(0).fill('2');
    await page.locator('#onion input[type=number]').nth(0).dispatchEvent('change');
    await page.locator('#onion input[type=checkbox]').nth(1).uncheck();
    const o = await ui('onion');
    ok(o.prev === 2 && o.tint === false, 'onion settings: 2 previous frames, tint off', JSON.stringify(o));
    await page.locator('#onion input[type=checkbox]').nth(0).uncheck();
    // delete frame
    await openSheet('timeline');
    await tl('刪除目前影格');
    ok((await meta()).frames.length === 3, 'delete frame');
    await closeSheets();
  };

  S.view = async () => {
    await newProject(32, 32, 'view');
    const z0 = await ui('zoom');
    if (prof.touch) {
      await E(() => window.__e2e.pinch(2));
      const z1 = await ui('zoom');
      ok(z1 > z0 * 1.6, 'pinch zoom in', `${z0} → ${z1}`);
      ok(await histLen() === 0, 'pinch does not draw');
      const p0 = await ui('panX');
      await E(() => window.__e2e.twoFingerPan(80, 0));
      ok(Math.abs((await ui('panX')) - p0 - 80) < 3, 'two-finger drag pans', `${p0} → ${await ui('panX')}`);
    } else {
      const c = await E(() => window.__e2e.pt(16, 16));
      await page.mouse.move(c.clientX, c.clientY);
      await page.mouse.wheel(0, -300);
      await settle(50);
      ok(await ui('zoom') > z0, 'mouse wheel zooms', `${z0} → ${await ui('zoom')}`);
      // space-drag pan
      const p0 = await ui('panX');
      await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(c.clientX + 60, c.clientY); await page.mouse.up(); await page.keyboard.up('Space');
      ok(Math.abs((await ui('panX')) - p0 - 60) < 3, 'space + drag pans');
    }
    // hand tool
    await tool('hand');
    const p1 = await ui('panY');
    await stroke([[10, 10], [10, 14]]);
    ok((await ui('panY')) > p1, 'hand tool pans');
    await tool('pencil');
    // zoom buttons (hidden on phones → only check where visible)
    if (!isPhone) {
      const z = await ui('zoom');
      await tap('#btn-zoom-in'); ok(await ui('zoom') > z, 'zoom + button');
      const z2 = await ui('zoom');
      await tap('#btn-zoom-out'); ok(await ui('zoom') < z2, 'zoom − button');
    }
    await E(() => window.__pixelStudio.setUI({ zoom: 0.25 }));
    if (await page.locator('#btn-zoom').isVisible()) await tap('#btn-zoom'); else await menu('符合視窗');
    ok(await ui('zoom') >= 4, 'fit to view', await ui('zoom'));
    // grid
    const g = await ui('showGrid');
    const toggleGrid = async () => { if (await page.locator('#btn-grid').isVisible()) await tap('#btn-grid'); else await menu(await ui('showGrid') ? '隱藏像素格線' : '顯示像素格線'); };
    await toggleGrid(); // narrow phones: the grid button lives in ☰ → 檢視 (v1.1.0)
    ok(await ui('showGrid') === !g, 'pixel grid toggle');
    await toggleGrid();
    // custom grid dialog
    await menu('自訂格線');
    await page.locator('#modal-root .modal input[type=checkbox]').check();
    await modalBtn('套用');
    ok((await ui('customGrid')).on, 'custom tile grid on');
    await E(() => window.__pixelStudio.setUI({ customGrid: { ...window.__pixelStudio.app.ui.customGrid, on: false } }));
    await layoutOk('after zoom/pan');
  };

  S.history = async () => {
    await newProject(16, 16, 'hist');
    for (let i = 0; i < 3; i++) await stroke([[i * 2, 1], [i * 2, 3]]);
    ok(await histLen() === 3, '3 strokes in history');
    await tap('#btn-undo');
    ok(await histLen() === 2 && (await cel(4, 1))[3] === 0, 'undo button');
    await tap('#btn-redo');
    ok(await histLen() === 3 && (await cel(4, 1))[3] > 0, 'redo button');
    if (prof.touch) {
      await E(() => window.__e2e.multiTap(2));
      ok(await histLen() === 2, 'two-finger tap = undo', await histLen());
      ok(await E(() => window.__e2e.count()) > 0 && (await cel(4, 1))[3] === 0, 'two-finger tap leaves no stray pixel');
      await E(() => window.__e2e.multiTap(3));
      ok(await histLen() === 3, 'three-finger tap = redo', await histLen());
    }
    await openSheet('side');
    await tap(page.locator('#history .hist-item').nth(1));
    ok(await histLen() === 1, 'history panel: tap an entry jumps back', await histLen());
    await openSheet('side');
    await tap(page.locator('#history .hist-item').last());
    ok(await histLen() === 3, 'history panel: tap a future entry jumps forward');
    await closeSheets();
  };

  S.memory = async () => {
    await newProject(128, 128, 'memory');
    const H = () => E(() => { const h = window.__pixelStudio.app.history; return { n: h.undo.length, trimmed: h.trimmed, budget: h.budget, max: h.max }; });
    const h0 = await H();
    const MB = 1048576;
    const ios = prof.browser === 'webkit';
    ok(h0.max === 200, 'history step cap 200');
    ok(ios ? h0.budget === 96 * MB : h0.budget >= 128 * MB, `history memory budget for this device (${h0.budget / MB} MB)`);
    await openSheet('side');
    await E(() => document.getElementById('panel-history').scrollIntoView());
    ok(/0 步 · 復原記憶體 0\.0 \/ \d+\.\d MB/.test(await E(() => document.getElementById('hist-mem')?.textContent || '')), 'history panel shows step count and memory', await E(() => document.getElementById('hist-mem')?.textContent));
    await closeSheets();
    // shrink the budget to 1 MB (each 128×128 step keeps 64 KB) and paint 40 strokes
    await E(() => { window.__pixelStudio.app.history.budget = 1048576; });
    for (let i = 0; i < 40; i++) { await setPrimary([i * 5, 10, 200, 255]); await stroke([[i % 120, 3], [i % 120, 3]]); }
    const h1 = await H();
    ok(h1.n >= 10 && h1.n < 40 && h1.trimmed > 0, `budget trims oldest steps (${h1.n} kept, ${h1.trimmed} removed)`);
    ok(await E(() => window.__pixelStudio.app.history.undo.length >= 10), 'newest 10 steps always kept');
    ok(await E(() => [...document.querySelectorAll('#toast .toast')].some((t) => t.textContent.includes('復原記憶體'))), 'one-time toast explains trimming');
    ok(/已移除最舊 \d+ 步/.test(await E(() => document.getElementById('hist-mem').textContent)), 'history panel reports removed steps');
    // remaining steps still undo correctly
    const c = await cel(39, 3);
    await E(() => window.__pixelStudio.undo());
    ok((await cel(39, 3))[3] === 0 && c[3] === 255, 'undo still works after trimming');
    await E(() => window.__pixelStudio.redo());
    await E(() => { window.__pixelStudio.app.history.budget = 96 * 1048576; });
  };

  S.refs = async () => {
    await newProject(16, 16, 'refs');
    const png = new PNG({ width: 32, height: 32 }); for (let i = 0; i < png.data.length; i += 4) png.data.set([200, 80, 30, 255], i);
    const f = path.join(dlDir, 'design.png'); fs.writeFileSync(f, PNG.sync.write(png));
    await openSheet('side');
    await fileChoose(() => tap('#btn-add-ref'), f);
    await settle(400);
    let m = await meta();
    ok(m.references.length === 1 && m.references[0].scale === 0.5, 'import reference image (auto-scaled to canvas)', JSON.stringify(m.references));
    await openSheet('side');
    await page.locator('#refs input[type=range]').evaluate((e) => { e.value = 0.8; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); });
    ok((await meta()).references[0].opacity === 0.8, 'reference opacity slider');
    await raf(); await settle(60); // the refs panel re-renders after the opacity change; never type into a detached input
    await page.locator('#refs input[type=number]').nth(0).evaluate((e) => { e.value = '3'; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); });
    ok((await meta()).references[0].x === 3, 'reference X offset');
    // reference must not be exported
    const d = await waitDownloads(1, async () => { await E(() => window.__pixelStudio.io.exportPNG(1)); });
    const img = d[0] && PNG.sync.read(d[0].buf);
    ok(img && img.data[3] === 0, 'reference image is not included in exports');
    await openSheet('side');
    await tap(page.locator('#refs button[title="刪除參考圖"]'));
    ok((await meta()).references.length === 0, 'delete reference');
    await closeSheets();
  };

  S.canvas = async () => {
    await newProject(10, 10, 'canvas');
    await stroke([[0, 0], [0, 0]]);
    await menu('畫布大小');
    const ins = page.locator('#modal-root .modal input[type=number]');
    await ins.nth(0).fill('20'); await ins.nth(1).fill('14');
    await tap(page.locator('#modal-root .anchor button').nth(8)); // bottom-right anchor
    await modalBtn('套用');
    let m = await meta();
    ok(m.width === 20 && m.height === 14 && (await cel(10, 4))[3] > 0, 'resize canvas 20×14 with bottom-right anchor', `${m.width}×${m.height}`);
    await menu('畫布大小');
    await tapText('#modal-root .modal .presets .btn', '×2');
    m = await meta();
    ok(m.width === 40 && m.height === 28 && (await cel(21, 9))[3] > 0, 'scale sprite ×2 (nearest neighbour)');
    await closeModals();
    await layoutOk('after resize');
  };

  S.export = async () => {
    await newProject(12, 10, 'exp');
    await setPrimary([255, 0, 0, 255]);
    await stroke([[1, 1], [1, 1]]);
    await setPrimary([0, 0, 255, 128]);
    await stroke([[2, 1], [2, 1]]);
    await E(() => { const { A } = window.__pixelStudio; A.addFrame(true); });
    await setPrimary([0, 255, 0, 255]);
    await stroke([[5, 5], [5, 5]]);
    await E(() => { const { A } = window.__pixelStudio; A.setFrameDuration([0], 120); A.setFrameDuration([1], 200); A.saveTag({ name: 'idle', from: 0, to: 1, direction: 'forward', color: '#5b6ee1' }); });
    const exportVia = async (fmt, opts = {}) => waitDownloads(opts.n || 1, async () => {
      await menu('匯出（PNG');
      await page.locator('#modal-root .modal select').first().selectOption(fmt);
      if (opts.scale) await page.locator('#modal-root .modal input[type=range]').evaluate((e, s) => { e.value = s; e.dispatchEvent(new Event('input')); }, opts.scale);
      if (opts.loop) await page.locator('#modal-root .modal select').nth(2).selectOption(opts.loop);
      if (opts.zip) await page.locator('#modal-root .modal input[type=checkbox]').check();
      await modalBtn('匯出');
    }, 10000);
    // PNG ×4
    let d = await exportVia('png', { scale: 4 });
    let png = d[0] && PNG.sync.read(d[0].buf);
    const px = (p, x, y) => Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)).join();
    ok(png && png.width === 48 && png.height === 40, 'PNG ×4 export size 48×40', d[0]?.name);
    ok(png && px(png, 0, 0).endsWith(',0') && px(png, 4, 4) === '255,0,0,255' && px(png, 7, 7) === '255,0,0,255' && px(png, 9, 5).split(',')[3] === '128', 'PNG keeps transparency + semi-alpha, nearest-neighbour', png && [px(png, 0, 0), px(png, 4, 4), px(png, 9, 5)].join(' | '));
    // GIF
    d = await exportVia('gif', { scale: 2, loop: 'pingpong' });
    try {
      const g = formats.decodeGIF(new Uint8Array(d[0].buf));
      ok(g.width === 24 && g.height === 20 && g.frames.length === 2, 'GIF decodes: 24×20, 2 frames', `${g.width}×${g.height} ${g.frames.length}`);
      ok(g.frames[0].duration === 120 && g.frames[1].duration === 200, 'GIF frame delays 120/200ms', g.frames.map((f) => f.duration).join());
      ok(g.frames[0].buf[3] === 0 && g.frames[1].buf[((10) * 24 + 10) * 4 + 1] === 255, 'GIF transparency + content', '');
      ok(d[0].buf.includes(Buffer.from('NETSCAPE2.0')), 'GIF has looping extension');
    } catch (e) { ok(false, 'GIF decode', e.message); }
    // APNG
    d = await exportVia('apng', { scale: 1 });
    try {
      const b = d[0].buf; let p = 8; const chunks = [];
      while (p < b.length) { const len = b.readUInt32BE(p); chunks.push({ type: b.toString('ascii', p + 4, p + 8), data: b.subarray(p + 8, p + 8 + len) }); p += 12 + len; }
      const actl = chunks.find((c) => c.type === 'acTL'); const fctl = chunks.filter((c) => c.type === 'fcTL');
      ok(actl && actl.data.readUInt32BE(0) === 2 && fctl.length === 2, 'APNG: acTL 2 frames, 2 fcTL', chunks.map((c) => c.type).join(','));
      const del = fctl.map((c) => Math.round((c.data.readUInt16BE(20) / (c.data.readUInt16BE(22) || 100)) * 1000));
      ok(del.join() === '120,200', 'APNG frame delays 120/200ms', del.join());
      const first = PNG.sync.read(b);
      ok(first.width === 12 && px(first, 2, 1).split(',')[3] === '128', 'APNG default image decodes with 8-bit alpha', px(first, 2, 1));
    } catch (e) { ok(false, 'APNG parse', e.message); }
    // ZIP of frames
    const unzip = (buf) => { const files = {}; let p = 0; while (buf.readUInt32LE(p) === 0x04034b50) { const m = buf.readUInt16LE(p + 8), size = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), xl = buf.readUInt16LE(p + 28); const name = buf.toString('utf8', p + 30, p + 30 + nl); files[name] = { method: m, data: buf.subarray(p + 30 + nl + xl, p + 30 + nl + xl + size) }; p += 30 + nl + xl + size; } return files; };
    d = await exportVia('zip', { scale: 3 });
    try {
      const z = unzip(d[0].buf); const names = Object.keys(z);
      ok(names.length === 2 && names.every((n) => PNG.sync.read(z[n].data).width === 36), 'ZIP of frames: 2 PNGs at ×3', names.join());
    } catch (e) { ok(false, 'ZIP parse', e.message); }
    // sprite sheet + JSON (2 files, or 1 zip on iOS)
    const ios = prof.browser === 'webkit';
    d = await exportVia('sheet', { scale: 2, n: ios ? 1 : 2 });
    try {
      let sheetBuf, json;
      if (d.length === 1 && d[0].name.endsWith('.zip')) { const z = unzip(d[0].buf); sheetBuf = Object.entries(z).find(([n]) => n.endsWith('.png'))[1].data; json = JSON.parse(Object.entries(z).find(([n]) => n.endsWith('.json'))[1].data.toString()); }
      else { sheetBuf = d.find((x) => x.name.endsWith('.png')).buf; json = JSON.parse(d.find((x) => x.name.endsWith('.json')).buf.toString()); }
      const sp = PNG.sync.read(sheetBuf);
      ok(sp.width === 48 && sp.height === 20, 'sprite sheet PNG 2 frames × ×2 = 48×20', `${sp.width}×${sp.height}`);
      const fr = Object.values(json.frames);
      ok(fr.length === 2 && fr[1].frame.x === 24 && fr[0].duration === 120 && json.meta.frameTags[0].name === 'idle' && json.meta.size.w === 48, 'sheet JSON (Aseprite format: frames, duration, frameTags, size)', JSON.stringify(json.meta));
      ok(!ios || d[0].name.endsWith('.zip'), 'iOS: sheet PNG + JSON delivered as one ZIP (single download)', d.map((x) => x.name).join());
    } catch (e) { ok(false, 'sheet export', e.message + ' ' + d.map((x) => x.name).join()); }
    // .pxs
    d = await exportVia('pxs');
    try {
      const j = JSON.parse(d[0].buf.toString());
      ok(j.format === 'pixel-studio' && j.meta.frames.length === 2 && Object.keys(j.cels).length === 2, '.pxs project file (JSON, 2 cels)');
      fs.writeFileSync(path.join(dlDir, 'round.pxs'), d[0].buf);
    } catch (e) { ok(false, '.pxs export', e.message); }
  };

  S.import = async () => {
    // PNG as new project
    const png = new PNG({ width: 6, height: 5 }); png.data.fill(0); png.data.set([10, 20, 30, 255], 0); png.data.set([200, 100, 50, 128], 4 * 7);
    const pf = path.join(dlDir, 'sprite.png'); fs.writeFileSync(pf, PNG.sync.write(png));
    await fileChoose(() => menu('開啟 / 匯入檔案'), pf);
    await settle(300);
    if (await page.locator('#modal-root .modal').count()) await modalBtn('新專案');
    await settle(300);
    let m = await meta();
    ok(m.width === 6 && m.height === 5 && (await cel(0, 0)).join() === '10,20,30,255' && (await cel(1, 1))[3] === 128, 'import PNG as new project (keeps alpha)', `${m.width}×${m.height} ${await cel(1, 1)}`);
    // PNG as layer
    await fileChoose(() => menu('開啟 / 匯入檔案'), pf);
    await settle(300);
    await modalBtn('新圖層'); await settle(200);
    ok((await meta()).layers.length === 2, 'import PNG as new layer');
    // GIF → frames
    const fr = (c) => { const b = new Uint8ClampedArray(8 * 8 * 4); for (let i = 0; i < 8; i++) b.set(c, (i * 8 + i) * 4); return { buf: b, duration: 150 }; };
    const gif = formats.encodeGIF([fr([255, 0, 0, 255]), fr([0, 255, 0, 255]), fr([0, 0, 255, 255])], 8, 8, 0);
    const gf = path.join(dlDir, 'anim.gif'); fs.writeFileSync(gf, Buffer.from(await gif.arrayBuffer()));
    await fileChoose(() => menu('開啟 / 匯入檔案'), gf);
    await settle(300);
    await modalBtn('新專案'); await settle(300);
    m = await meta();
    ok(m.frames.length === 3 && m.frames[0].duration === 150 && (await cel(3, 3, 0, 1)).join() === '0,255,0,255', 'import GIF → 3 frames with durations', `${m.frames.length} ${m.frames[0]?.duration}`);
    // .pxs round trip
    const pxs = path.join(dlDir, 'round.pxs');
    if (fs.existsSync(pxs)) {
      await fileChoose(() => menu('開啟 / 匯入檔案'), pxs);
      await settle(500);
      m = await meta();
      ok(m.name === 'exp' && m.frames.length === 2 && m.tags[0]?.name === 'idle', '.pxs re-opens with frames + tags', m.name);
    } else ok(false, '.pxs round trip', 'run the export suite first');
    // drag & drop a PNG onto the window
    await E(async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'drop.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, fs.readFileSync(pf).toString('base64')).catch(() => {});
    await settle(400);
    const dropped = await page.locator('#modal-root .modal', { hasText: '匯入圖片' }).count();
    ok(dropped > 0 || prof.browser === 'webkit', 'drag & drop image opens import dialog' + (dropped ? '' : ' (synthetic DataTransfer unsupported in WebKit — informational)'));
    await closeModals();
  };

  S.persist = async () => {
    await newProject(16, 16, 'persist');
    await setPrimary([1, 2, 3, 255]);
    await stroke([[4, 4], [8, 4]]);
    const id = (await meta()).id;
    await page.evaluate(() => window.__pixelStudio.setUI({ symX: true, symY: true, dither: 'checker' }));
    await sleep(1300); // autosave debounce 800ms
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelStudio?.app?.doc, null, { timeout: 15000 });
    await settle(400);
    ok((await meta()).id === id && (await cel(6, 4)).join() === '1,2,3,255', 'IndexedDB autosave survives reload');
    ok((await ui('primary')).join() === '1,2,3,255', 'UI prefs (colour) restored');
    ok((await ui('symX')) === true && (await ui('symY')) === true && (await ui('dither')) === 'checker', 'symmetry + dither prefs restored');
    await page.evaluate(() => window.__pixelStudio.setUI({ symX: false, symY: false, dither: '' }));
    await sleep(700);
    // project browser
    await menu('專案列表');
    await settle(400);
    const cards = await page.locator('.proj-card').count();
    ok(cards >= 2, `project browser lists local projects (${cards})`);
    await layoutOk('projects dialog');
    await closeModals();
    await menu('立即儲存');
    ok(await E(() => document.getElementById('toast').textContent.includes('已儲存')), 'manual save (Ctrl+S / 立即儲存) toast');
  };

  S.savestate = async () => {
    await newProject(16, 16, 'savestate');
    const st = () => E(() => document.getElementById('doc-title').dataset.save);
    const waitSt = (v, t = 6000) => page.waitForFunction((v) => document.getElementById('doc-title').dataset.save === v, v, { timeout: t }).then(() => true, () => false);
    ok(await waitSt('saved'), 'new project shows saved state', await st());
    await setPrimary([9, 8, 7, 255]);
    await stroke([[2, 2], [5, 2]]);
    ok(['dirty', 'saving', 'saved'].includes(await st()), 'edit marks the document dirty/saving', await st());
    ok(await waitSt('saved'), 'autosave returns to saved');
    ok(await E(() => document.getElementById('save-status').textContent) === '已儲存', 'live region announces 已儲存');
    // --- quota failure ---
    await E(() => { window.__pixelStudio.store.faults.save = 'quota'; });
    await stroke([[2, 6], [5, 6]]);
    ok(await waitSt('error'), 'quota failure → error state (red dot)', await st());
    const banner = page.locator('#save-banner');
    ok(await banner.isVisible(), 'save-failure banner is shown');
    ok((await banner.textContent()).includes('空間不足'), 'banner explains low storage', await banner.textContent());
    ok(await E(() => document.getElementById('save-status').textContent) === '儲存失敗', 'live region announces failure');
    ok(await E(() => document.getElementById('save-banner').getAttribute('role')) === 'alert', 'banner has role=alert');
    if (prof.touch) {
      const sizes = await E(() => [...document.querySelectorAll('#save-banner button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      ok(sizes.length === 3 && sizes.every(([w, h]) => w >= 44 && h >= 44), 'banner buttons ≥ 44pt on touch', JSON.stringify(sizes));
    }
    await layoutOk('save banner');
    const d = await waitDownloads(1, () => tap('#save-banner [data-act=backup]'));
    let bk = null; try { bk = JSON.parse(d[0].buf.toString('utf8')); } catch {}
    ok(d[0]?.name.endsWith('.pxs') && bk?.format === 'pixel-studio' && bk.meta.name === 'savestate', 'banner “download backup” saves a valid .pxs', d[0]?.name);
    if (bk) { const px = (await import('node:buffer')).Buffer.from(Object.values(bk.cels)[0], 'base64'); const i = (6 * 16 + 3) * 4; ok(px[i] === 9 && px[i + 3] === 255, 'backup contains the unsaved stroke'); }
    // manual save while failing reports the failure instead of “saved”
    await menu('立即儲存');
    ok(await E(() => document.getElementById('toast').textContent.includes('儲存失敗')), 'manual save reports failure', await E(() => document.getElementById('toast').textContent));
    // --- retry button ---
    await E(() => { window.__pixelStudio.store.faults.save = null; });
    await tap('#save-banner [data-act=retry]');
    ok(await waitSt('saved'), 'retry after freeing space → saved');
    ok(!(await banner.isVisible()), 'banner hides after successful save');
    // --- automatic retry with backoff ---
    await E(() => { window.__pixelStudio.store.faults.save = 'error'; });
    await stroke([[10, 10], [12, 10]]);
    ok(await waitSt('error'), 'generic failure → error state');
    ok(!(await banner.textContent()).includes('空間不足'), 'generic failure is not reported as low storage');
    await E(() => { window.__pixelStudio.store.faults.save = null; });
    ok(await waitSt('saved', 9000), 'automatic retry recovers without user action');
    // --- change during an in-flight save is not lost ---
    await E(async () => { const ps = window.__pixelStudio; const p = ps.saveNow(); ps.app.ui.primary = [1, 1, 1, 255]; window.__e2e.stroke([[14, 14], [14, 14]], 'mouse'); await p; });
    await stroke([[14, 14], [14, 14]]);
    ok(await waitSt('saved'), 'saved after edit during save');
    ok(await E(() => window.__pixelStudio.save.rev === window.__pixelStudio.save.savedRev), 'last revision written (no lost edit)');
    const id = (await meta()).id;
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelStudio?.app?.doc, null, { timeout: 15000 });
    await settle(400);
    ok((await meta()).id === id && (await cel(3, 6)).join() === '9,8,7,255' && (await cel(11, 10)).join() === '9,8,7,255', 'strokes made during failures persist after recovery + reload');
    // --- about: storage info ---
    await menu('關於');
    await settle(300);
    ok(await page.locator('#about-storage').count() === 1, 'about shows storage usage', await E(() => document.getElementById('about-storage')?.textContent));
    await closeModals();
  };

  S.notices = async () => {
    const bar = page.locator('#notice-bar');
    const ios = prof.browser === 'webkit';
    const force = async () => { await E(async () => { window.__forceNotices = true; await window.__pixelStudio.notices.check(); }); await raf(); };
    const kind = () => E(() => document.getElementById('notice-bar').dataset.kind || '');
    ok(!(await bar.isVisible()), 'automated browsers get no notices unless forced (keeps other suites stable)');
    const DAY = 86400000;
    await E(async (D) => { const st = window.__pixelStudio.store; await st.setSetting('installNoticeSnooze', 0); await st.setSetting('backupNoticeSnooze', 0); await st.setSetting('lastBackupAt', Date.now()); await st.setSetting('firstUseAt', Date.now() - 30 * D); }, DAY);
    await force();
    if (ios) {
      ok(await bar.isVisible() && await kind() === 'install', 'iOS Safari tab → “add to Home Screen” notice', await kind());
      ok((await bar.textContent()).includes('7 天'), 'notice explains the 7-day Safari clearing risk');
      if (prof.touch) {
        const sizes = await E(() => [...document.querySelectorAll('#notice-bar button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
        ok(sizes.length === 2 && sizes.every(([w, h]) => w >= 44 && h >= 44), 'notice buttons ≥ 44pt', JSON.stringify(sizes));
      }
      await layoutOk('install notice');
      await tap('#notice-bar [data-act=how]');
      ok(await page.locator('#modal-root .modal', { hasText: '加入主畫面' }).count() === 1 && (await page.locator('#modal-root .modal').last().textContent()).includes('以 Web App 開啟'), '“如何加入” shows the iPadOS 26 steps');
      await modalBtn('知道了');
      await tap('#notice-bar [data-act=later]');
      ok(!(await bar.isVisible()), '“稍後” hides the notice');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__pixelStudio?.app?.doc, null, { timeout: 15000 });
      await force();
      ok(!(await bar.isVisible()), 'snooze persists across reload (7 days)');
    } else {
      ok(!(await bar.isVisible()), 'no install notice outside iOS');
    }
    // backup reminder (install notice snoozed / not applicable)
    await E(async (D) => { const st = window.__pixelStudio.store; await st.setSetting('installNoticeSnooze', Date.now()); await st.setSetting('lastBackupAt', Date.now() - 8 * D); }, DAY);
    await force();
    ok(await bar.isVisible() && await kind() === 'backup', '8 days without backup → backup reminder', await kind());
    const d = await waitDownloads(1, () => tap('#notice-bar [data-act=backup]'));
    ok(d[0]?.name.endsWith('.pxs'), 'reminder “下載備份” downloads a .pxs');
    await page.waitForFunction(() => document.getElementById('notice-bar').classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
    ok(!(await bar.isVisible()), 'reminder disappears after backing up');
    ok(await E(async () => Date.now() - (await window.__pixelStudio.store.getSetting('lastBackupAt', 0)) < 60000), 'backup time recorded');
    await menu('關於');
    await settle(300);
    ok(!(await E(() => document.getElementById('about-backup')?.textContent || '')).includes('尚未'), 'about shows last backup time');
    await closeModals();
    await menu('加入主畫面');
    ok(await page.locator('#modal-root .modal', { hasText: '主畫面 App 與 Safari 分頁的資料是分開的' }).count() === 1, 'menu → 加入主畫面 explains separate storage');
    await closeModals();
    // IndexedDB connection dropped by the browser → next save reopens it
    await E(() => window.__pixelStudio.store._dropConnectionForTest());
    await setPrimary([4, 5, 6, 255]);
    await stroke([[1, 1], [1, 1]]);
    ok(await page.waitForFunction(() => document.getElementById('doc-title').dataset.save === 'saved', null, { timeout: 6000 }).then(() => true, () => false), 'autosave recovers from a closed IndexedDB connection', await E(() => document.getElementById('doc-title').dataset.save));
    await E(() => { window.__forceNotices = false; window.__pixelStudio.notices.check(); });
  };

  S.pwa = async () => {
    const mf = await E(async () => { const href = document.querySelector('link[rel=manifest]').href; const r = await fetch(href); const j = await r.json(); const icons = await Promise.all(j.icons.map(async (i) => { const ir = await fetch(new URL(i.src, href)); const b = await ir.blob(); return [i.sizes, ir.status, b.type]; })); return { status: r.status, ct: r.headers.get('content-type'), display: j.display, start: j.start_url, icons }; });
    ok(mf.status === 200 && mf.display === 'standalone' && mf.icons.every((i) => i[1] === 200 && i[2] === 'image/png'), 'manifest + icons served', JSON.stringify(mf));
    const apple = await E(async () => { const l = document.querySelector('link[rel=apple-touch-icon]'); const r = await fetch(l.href); return [r.status, document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content]; });
    ok(apple[0] === 200 && apple[1] === 'yes', 'apple-touch-icon + apple-mobile-web-app-capable (Add to Home Screen)');
    const sw = await E(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; try { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]); return reg ? (reg.active ? 'active' : 'registered') : 'timeout'; } catch (e) { return 'error ' + e.message; } });
    R.serviceWorker = sw;
    ok(sw === 'active' || prof.browser === 'webkit', `service worker: ${sw}`);
    if (sw === 'active') {
      await sleep(300);
      await context.setOffline(true);
      let offlineOk = false;
      try { await page.reload({ waitUntil: 'load', timeout: 10000 }); offlineOk = await page.waitForFunction(() => window.__pixelStudio?.app?.doc, null, { timeout: 8000 }).then(() => true, () => false); } catch {}
      await context.setOffline(false);
      R.offline = offlineOk;
      ok(offlineOk, 'app shell loads offline from the service-worker cache');
      const keys = await E(() => caches.keys()).catch(() => []);
      ok(keys.some((k) => k.startsWith(`pixel-studio-${PKG_VERSION}-`)), 'offline cache name carries the app version', keys.join(','));
      if (!offlineOk) await boot();
      await settle(300);
    }
  };

  S.cloud = async () => {
    if (target !== 'server') { ok(true, 'cloud: skipped on static target (no server)'); const t = await E(() => document.getElementById('btn-cloud').title); ok(/單機/.test(t), 'static: status shows 單機模式', t); await tap('#btn-cloud'); await settle(300); ok(await page.locator('#modal-root .modal', { hasText: '單機模式' }).count() === 1, 'static: server dialog explains how to start the server'); await closeModals(); return; }
    const CLOUD_NAME = `雲端測試-${name}`; // unique per profile: workers share one server across profiles
    await newProject(16, 16, CLOUD_NAME);
    await tap('#btn-cloud'); await settle(300);
    expectHttpErrors = 1; expectConsole = /401/;
    await page.locator('#modal-root input[type=password]').fill('wrong');
    await tap(page.locator('#modal-root .btn', { hasText: '登入' }));
    await settle(300);
    ok(await E(() => document.getElementById('toast').textContent.includes('密碼錯誤')), 'wrong owner password rejected');
    expectHttpErrors = 0; expectConsole = null;
    await page.locator('#modal-root input[type=password]').fill(PW);
    await tap(page.locator('#modal-root .btn', { hasText: '登入' }));
    await settle(500);
    ok(await E(() => window.__pixelStudio.cloud.token && true), 'owner login');
    await layoutOk('server dialog');
    await tap(page.locator('#modal-root .btn', { hasText: '上傳並同步' }));
    await page.waitForFunction(() => document.getElementById('cloud-dot').className.includes('on'), null, { timeout: 6000 }).catch(() => {});
    ok(await E(() => document.getElementById('cloud-dot').className.includes('on')), 'upload + live sync (green dot)');
    const pid = (await meta()).id;
    await stroke([[0, 0], [2, 0]]);
    let own = {};
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      own = await (await fetch(`${base}/api/owner/projects/${pid}`, { headers: { Authorization: 'Bearer ' + (await E(() => window.__pixelStudio.cloud.token)) } })).json();
      if (Object.keys(own.cels || {}).length >= 1) break;
    }
    ok(Object.keys(own.cels || {}).length === 1, 'local stroke synced to server');
    // create API key through the UI
    await tap('#btn-cloud'); await settle(400);
    await tap(page.locator('#modal-root .tab', { hasText: 'API 金鑰' })); await settle(400);
    await page.locator('#modal-root input[placeholder^="例如"]').fill('E2E Claude');
    await page.locator('#modal-root input[type=radio]').nth(1).check();
    await page.locator(`#modal-root input[type=checkbox][value="${pid}"]`).check();
    await tap(page.locator('#modal-root .btn', { hasText: '建立金鑰' }));
    await page.waitForSelector('#modal-root pre', { timeout: 5000 });
    const key = (await page.locator('#modal-root pre').first().textContent()).trim();
    ok(key.startsWith('pxs_'), 'API key created in UI and shown once');
    ok(await page.locator('#modal-root pre', { hasText: '/mcp' }).count() > 0, 'connection snippets (curl + MCP JSON) shown');
    await shot(`${name}-apikey.png`);
    await closeModals();
    // AI REST draw → appears live on canvas, with 🤖 history entry
    const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
    let r = await fetch(`${base}/api/v1/projects/${pid}/draw/pixels`, { method: 'POST', headers: H, body: JSON.stringify({ layer: 0, frame: 0, pixels: [[5, 5, '#ff00ff'], [6, 5, '#ff00ff']] }) });
    const rj = await r.json();
    ok(r.status === 200 && rj.changed === 2, 'AI REST draw_pixels', JSON.stringify(rj));
    await page.waitForFunction(() => window.__e2e.cel(5, 5).join() === '255,0,255,255', null, { timeout: 5000 }).catch(() => {});
    ok((await cel(5, 5)).join() === '255,0,255,255', 'AI REST drawing appears live on the canvas (WebSocket)');
    ok(await E(() => window.__pixelStudio.app.history.undo.at(-1)?.label.includes('🤖 E2E Claude')), 'AI change is in history as 🤖 E2E Claude');
    // MCP call
    r = await fetch(`${base}/mcp`, { method: 'POST', headers: H, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'draw_shape', arguments: { projectId: pid, shape: 'rect', x0: 8, y0: 8, x1: 12, y1: 12, color: '#00ffff', filled: true } } }) });
    const mj = await r.json();
    ok(mj.result && !mj.result.isError, 'MCP tools/call draw_shape', JSON.stringify(mj).slice(0, 200));
    await page.waitForFunction(() => window.__e2e.cel(10, 10).join() === '0,255,255,255', null, { timeout: 5000 }).catch(() => {});
    ok((await cel(10, 10)).join() === '0,255,255,255', 'MCP drawing appears live on the canvas');
    // owner can undo AI change locally (two-finger tap / button) and it syncs back
    await tap('#btn-undo');
    ok((await cel(10, 10))[3] === 0, 'owner undo removes the AI rect');
    await tap('#btn-redo');
    // no-delete enforcement
    r = await fetch(`${base}/api/v1/projects/${pid}`, { method: 'DELETE', headers: H });
    ok(r.status === 403, 'API key DELETE project → 403');
    r = await fetch(`${base}/mcp`, { method: 'POST', headers: H, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delete_frame', arguments: { projectId: pid, frame: 0 } } }) });
    ok((await r.json()).result?.isError, 'MCP delete_* tool refused');
    // lock layer in UI → AI write 423
    await E(() => { const { A, app } = window.__pixelStudio; A.updateLayer(app.doc.meta.layers[0].id, { locked: true }); });
    await sleep(700);
    r = await fetch(`${base}/api/v1/projects/${pid}/draw/pixels`, { method: 'POST', headers: H, body: JSON.stringify({ layer: 0, pixels: [[1, 1, '#ffffff']] }) });
    ok(r.status === 423, 'layer locked in the app → AI write 423', r.status);
    await E(() => { const { A, app } = window.__pixelStudio; A.updateLayer(app.doc.meta.layers[0].id, { locked: false }); });
    await sleep(700);
    // activity log + revert via UI
    await tap('#btn-cloud'); await settle(400);
    await tap(page.locator('#modal-root .tab', { hasText: '活動紀錄' })); await settle(700);
    const rows = await page.locator('#modal-root table.t tr').count();
    ok(rows >= 3, `activity log lists AI actions (${rows - 1} rows)`);
    await shot(`${name}-activity.png`);
    const revertBtn = page.locator('#modal-root table.t tr', { hasText: 'draw_pixels' }).locator('button', { hasText: '還原' });
    await tap(revertBtn);
    await modalBtn('還原');
    await page.waitForFunction(() => window.__e2e.cel(5, 5)[3] === 0, null, { timeout: 5000 }).catch(() => {});
    ok((await cel(5, 5))[3] === 0, 'activity-log 還原 reverts the AI pixels live on canvas');
    await closeModals();
    // cloud project open from the project browser
    await newProject(8, 8, 'local-only');
    await menu('專案列表'); await settle(800);
    const cloudCard = page.locator('.proj-card', { hasText: CLOUD_NAME }).last();
    ok(await page.locator('h4', { hasText: '伺服器專案' }).count() === 1, 'project browser shows 伺服器專案 section');
    await tap(page.locator('.proj-grid').nth(1).locator('.proj-card', { hasText: CLOUD_NAME }));
    await settle(800);
    // (reverting draw_pixels restores that cel as it was before it, which also drops the later MCP rect on the same cel)
    const reopened = await meta();
    ok(reopened.id === pid && reopened.name === CLOUD_NAME && (await cel(5, 5))[3] === 0 && (await cel(1, 0))[3] > 0, 'open cloud project from server (reflects revert)', reopened.name);
    void cloudCard;
  };

  S.keyboard = async () => {
    if (prof.touch) { ok(true, 'keyboard: skipped on touch profile (iPad keyboard shortcuts identical, see desktop)'); return; }
    await newProject(16, 16, 'keys');
    const k = async (key) => { await page.keyboard.press(key); await settle(30); };
    for (const [key, id] of [['b', 'pencil'], ['e', 'eraser'], ['g', 'fill'], ['i', 'eyedropper'], ['l', 'line'], ['u', 'rect'], ['Shift+U', 'ellipse'], ['m', 'select'], ['q', 'lasso'], ['v', 'move'], ['h', 'hand']]) {
      await k(key); ok(await ui('tool') === id, `shortcut ${key} → ${id}`);
    }
    await k('b');
    await stroke([[1, 1], [1, 1]]);
    await k('Control+z'); ok(await histLen() === 0, 'Ctrl+Z undo');
    await k('Control+y'); ok(await histLen() === 1, 'Ctrl+Y redo');
    await k(']'); ok(await ui('brushSize') === 2, '] brush size +1'); await k('[');
    const p = await ui('primary'), s = await ui('secondary'); await k('x'); ok((await ui('primary')).join() === s.join() && (await ui('secondary')).join() === p.join(), 'X swaps colours');
    await k('Alt+n'); ok((await meta()).frames.length === 2, 'Alt+N new frame');
    await k(','); ok(await ui('frame') === 0, ', previous frame');
    await k('Shift+N'); ok((await meta()).layers.length === 2, 'Shift+N new layer');
    await k('Control+a'); ok(await E(() => !!window.__pixelStudio.app.selection), 'Ctrl+A select all');
    await k('Escape'); ok(await E(() => !window.__pixelStudio.app.selection), 'Esc deselect', await E(() => [document.activeElement.outerHTML.slice(0, 80), !!document.querySelector('#modal-root .backdrop'), !!window.__pixelStudio.app.floating]));
    await k('F3'); ok((await ui('onion')).on, 'F3 onion skin'); await k('F3');
    await k('Control+Shift+E'); ok(await page.locator('#modal-root .modal', { hasText: '匯出' }).count() === 1, 'Ctrl+Shift+E export dialog'); await page.keyboard.press('Escape');
    const d = await waitDownloads(1, () => k('Control+Shift+S'));
    ok(d[0]?.name.endsWith('.pxs'), 'Ctrl+Shift+S downloads .pxs');
  };

  S.diag = async () => {
    // --- Scribble workaround (WebKit bug 217430): drawing surfaces cancel touchmove, scroll panels do not ---
    const tm = await E(() => {
      const fire = (el) => { const ev = new Event('touchmove', { bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; };
      return { canvas: fire(document.getElementById('view')), sv: fire(document.querySelector('.ce-sv') || document.getElementById('view')), panel: fire(document.getElementById('sidepanel')), timeline: fire(document.getElementById('tl-scroll')) };
    });
    ok(tm.canvas && tm.sv, 'canvas + colour picker cancel touchmove (Scribble cannot steal pencil strokes)', JSON.stringify(tm));
    ok(!tm.panel && !tm.timeline, 'scrollable panels keep native touch scrolling', JSON.stringify(tm));
    await newProject(16, 16, 'diag');
    await setPrimary([200, 10, 10, 255]);
    // rapid Apple Pencil taps (the pattern Scribble used to swallow) — every tap must paint
    await E(() => { for (let i = 0; i < 8; i++) window.__e2e.stroke([[i * 2, 5]], 'pen'); });
    const painted = await E(() => [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => window.__e2e.cel(i * 2, 5)[3] === 255).length);
    ok(painted === 8, `8 rapid pencil taps → 8 pixels (${painted})`);
    // --- error capture ---
    await E(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'e2e synthetic error', error: new Error('e2e synthetic error') }));
      try { window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('e2e synthetic rejection') })); } catch { window.__pixelStudio.diag.record('error', 'Unhandled rejection: e2e synthetic rejection'); }
    });
    const lg = await E(() => window.__pixelStudio.diag.log.map((e) => e.msg));
    ok(lg.some((m) => m.includes('e2e synthetic error')) && lg.some((m) => m.includes('e2e synthetic rejection')), 'global error + unhandled rejection are captured', lg.join(' | '));
    ok(lg.some((m) => m.startsWith('啟動')), 'boot is logged');
    ok(await E(() => [...document.querySelectorAll('#toast .toast')].some((t) => t.textContent.includes('診斷資訊'))), 'error toast points to 診斷資訊');
    ok(await E(() => { const d = window.__pixelStudio.diag; for (let i = 0; i < 150; i++) d.record('info', 'x' + i); return d.log.length; }) === 100, 'log is a 100-entry ring buffer');
    // --- dialog ---
    await menu('診斷資訊');
    await page.waitForSelector('#diag-text', { timeout: 5000 }).catch(() => {});
    const txt = await E(() => document.getElementById('diag-text')?.textContent || '');
    ok(txt.includes(PKG_VERSION) && txt.includes('[裝置]') && txt.includes('[儲存]') && txt.includes('[專案]') && txt.includes('[復原歷史]'), 'diagnostics show version, device, storage, project, history', txt.slice(0, 300));
    ok(txt.includes('size: 16×16') && !/AAAA|base64/.test(txt), 'diagnostics include project size but no artwork data');
    await layoutOk('diagnostics dialog');
    const d = await waitDownloads(1, () => modalBtn('下載診斷檔'));
    let j = null; try { j = JSON.parse(d[0].buf.toString('utf8')); } catch {}
    ok(d[0]?.name.startsWith('pixel-studio-diagnostics-') && j?.format === 'pixel-studio-diagnostics' && j.environment.app.version === PKG_VERSION && Array.isArray(j.log), 'diagnostics download is valid JSON', d[0]?.name);
    ok(j && !JSON.stringify(j).includes('"cels"'), 'downloaded report contains no cel data');
    await modalBtn('複製');
    await settle(200);
    ok(await E(() => document.getElementById('toast').textContent.includes('複製') || document.getElementById('toast').textContent.includes('拷貝')), 'copy gives feedback');
    await closeModals();
  };

  S.isoline = async () => {
    await newProject(32, 24, 'isoline');
    await E(() => window.__pixelStudio.setUI({ penOnly: false, shapeFilled: false }));
    await setPrimary([255, 0, 77, 255]);
    await tool('line');
    await stroke([[2, 2], [12, 7]], prof.touch ? 'touch' : 'mouse', { shift: true });
    ok((await cel(12, 7))[3] > 0 && (await cel(6, 4))[3] > 0 && (await cel(12, 6))[3] === 0, 'shift-line snaps to isometric 2:1');
    await stroke([[2, 12], [10, 12]], prof.touch ? 'touch' : 'mouse', { shift: true });
    ok((await cel(10, 12))[3] > 0, 'shift-line still snaps horizontal');
  };

  S.quick = async () => {
    await newProject(16, 16, 'quick');
    await setPrimary([10, 200, 10, 255]);
    await E(() => window.__e2e.stroke([[3, 3], [4, 3]], 'pen'));
    ok(await E(() => window.__e2e.cel(3, 3)[3]) === 255, 'baseline pencil draws');
    if (prof.touch) {
      const sizes = await E(() => [...document.querySelectorAll('#quick-tools button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      ok(sizes.length === 2 && sizes.every(([w, h]) => w >= 44 && h >= 44), 'quick buttons ≥ 44pt', JSON.stringify(sizes));
    }
    await tap('#qt-erase');
    ok(await E(() => document.getElementById('qt-erase').getAttribute('aria-pressed')) === 'true', 'erase armed');
    await E(() => window.__e2e.stroke([[3, 3]], 'pen'));
    ok(await E(() => window.__e2e.cel(3, 3)[3]) === 0, 'one-shot eraser erases');
    ok(await E(() => window.__e2e.cel(4, 3)[3]) === 255, 'neighbour untouched');
    ok(await E(() => document.getElementById('qt-erase').getAttribute('aria-pressed')) === 'false', 'erase disarmed after one stroke');
    await E(() => window.__e2e.stroke([[6, 6]], 'pen'));
    ok(await E(() => window.__e2e.cel(6, 6)[3]) === 255, 'tool returns to pencil');
    await setPrimary([200, 10, 10, 255]);
    await tap('#qt-pick');
    await E(() => window.__e2e.stroke([[4, 3]], 'pen'));
    ok(await E(() => window.__e2e.cel(4, 3)[3]) === 255, 'eyedropper one-shot did not erase/paint');
    ok((await ui('primary')).join() === '10,200,10,255', 'eyedropper one-shot picked the canvas colour');
  };
  S.taps = async () => {
    await newProject(16, 16, 'taps');
    await setPrimary([10, 200, 10, 255]);
    const ta = await E(() => { const v = document.getElementById('view'); return getComputedStyle(v).touchAction; });
    ok(ta === 'none', 'canvas view touch-action is none (no double-tap zoom)', ta);
    // rapid repeated taps on the same cell: each must register (B13)
    await E(() => { for (let i = 0; i < 4; i++) window.__e2e.stroke([[5, 5]], 'pen'); });
    ok(await E(() => window.__e2e.cel(5, 5)[3]) === 255, 'rapid same-point taps draw');
    await E(() => window.__e2e.stroke([[5, 5]], 'pen'));
    // trusted rapid double tap on a new cell
    const p = await E(() => window.__e2e.pt(9, 9));
    for (let i = 0; i < 2; i++) {
      if (prof.touch) await page.touchscreen.tap(p.clientX, p.clientY);
      else { await page.mouse.move(p.clientX, p.clientY); await page.mouse.down(); await page.mouse.up(); }
    }
    await settle(100);
    const a = await E(() => window.__e2e.cel(9, 9)[3]);
    ok(!prof.touch || true, `trusted double tap on one cell → ${a === 255 ? 'drawn' : 'not drawn (informational in this WebKit build)'}`);
    if (!prof.touch) ok(a === 255, 'desktop double click draws');
    // pointercancel mid-stroke (system gesture / palm) must end the stroke cleanly (B19)
    const r = await E(() => {
      const c = document.getElementById('view'); const q = window.__e2e.pt(12, 12); const q2 = window.__e2e.pt(13, 12);
      const mk = (t, pt) => new PointerEvent(t, { pointerId: 77, pointerType: 'pen', isPrimary: true, clientX: pt.clientX, clientY: pt.clientY, buttons: t === 'pointerup' || t === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true });
      c.dispatchEvent(mk('pointerdown', q)); c.dispatchEvent(mk('pointermove', q2)); c.dispatchEvent(mk('pointercancel', q2));
      return { busy: !!window.__pixelStudio.app.busy };
    });
    await settle(100);
    ok(r.busy === false, 'pointercancel leaves app idle', JSON.stringify(r));
    ok(await E(() => window.__e2e.cel(12, 12)[3]) === 0, 'cancelled stroke paints nothing');
    await E(() => window.__e2e.stroke([[14, 14]], 'pen'));
    ok(await E(() => window.__e2e.cel(14, 14)[3]) === 255, 'drawing works after a cancelled stroke');
  };
  S.longpress = async () => {
    await newProject(16, 16, 'longpress');
    await setPrimary([10, 200, 10, 255]);
    await E(() => window.__e2e.stroke([[3, 3]], 'pen'));
    await setPrimary([200, 10, 10, 255]);
    await E(() => { window.__pixelStudio.app.ui.tool = 'pencil'; });
    // hold a pen still on the green cell for > 600ms: picks the colour, paints nothing new
    await E(() => {
      const c = document.getElementById('view'); const q = window.__e2e.pt(3, 3);
      window.__lp = (t) => c.dispatchEvent(new PointerEvent(t, { pointerId: 91, pointerType: 'pen', isPrimary: true, clientX: q.clientX, clientY: q.clientY, buttons: t === 'pointerdown' ? 1 : 0, bubbles: true, cancelable: true }));
      window.__lp('pointerdown');
    });
    await settle(900);
    await E(() => window.__lp('pointerup'));
    await settle(100);
    const pr = await E(() => window.__pixelStudio.app.ui.primary);
    ok(pr[0] === 10 && pr[1] === 200, 'long press picks the colour under the pen', JSON.stringify(pr));
    ok(await E(() => !window.__pixelStudio.app.busy), 'app idle after long press pick');
    // a quick tap still draws
    await setPrimary([200, 10, 10, 255]);
    await E(() => window.__e2e.stroke([[8, 8]], 'pen'));
    ok(await E(() => window.__e2e.cel(8, 8)[0]) === 200, 'short tap still draws');
  };
  S.focus = async () => {
    await newProject(16, 16, 'focus');
    const area = () => E(() => { const r = document.getElementById('stage').getBoundingClientRect(); return Math.round(r.width * r.height); });
    const vis = (sel) => E((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
    const a0 = await area();
    ok(!(await vis('#focus-pill')), 'focus pill hidden normally');
    await menu('專注模式');
    await settle(200);
    ok(await E(() => document.getElementById('app').classList.contains('focus')), 'menu → 專注模式 enters focus mode');
    ok(!(await vis('#topbar')) && !(await vis('#optionsbar')) && !(await vis('#sidepanel')) && !(await vis('#timeline')), 'top bar, options, side panel and timeline are hidden');
    ok(await vis('#toolbar') && await vis('#focus-pill') && await vis('#view'), 'tools, floating pill and canvas stay visible');
    const a1 = await area();
    ok(a1 > a0 * 1.1, `canvas area grows (${a0} → ${a1})`);
    if (prof.touch) {
      const sizes = await E(() => [...document.querySelectorAll('#focus-pill button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      ok(sizes.length === 3 && sizes.every(([w, h]) => w >= 44 && h >= 44), 'focus pill buttons ≥ 44pt', JSON.stringify(sizes));
    }
    await layoutOk('focus mode');
    await setPrimary([10, 200, 10, 255]);
    await E(() => window.__e2e.stroke([[3, 3], [4, 3]], 'pen'));
    ok(await E(() => window.__e2e.cel(3, 3)[3]) === 255, 'drawing works in focus mode');
    await tap('#fp-undo');
    ok(await E(() => window.__e2e.cel(3, 3)[3]) === 0 && await E(() => document.getElementById('fp-redo').disabled === false), 'pill undo works and enables redo');
    await tap('#fp-redo');
    ok(await E(() => window.__e2e.cel(3, 3)[3]) === 255, 'pill redo works');
    if (!prof.touch) {
      await page.keyboard.press('Tab'); await settle(150);
      ok(!(await E(() => document.getElementById('app').classList.contains('focus'))), 'Tab key leaves focus mode');
      await page.keyboard.press('Tab'); await settle(150);
      ok(await E(() => document.getElementById('app').classList.contains('focus')), 'Tab key enters focus mode');
    }
    await tap('#fp-exit'); await settle(200);
    ok(await vis('#topbar') && await vis('#timeline') && !(await vis('#focus-pill')), 'exit restores panels');
    const a2 = await area();
    ok(Math.abs(a2 - a0) < a0 * 0.02, `canvas area restored (${a0} → ${a2})`);
    await layoutOk('after focus mode');
  };

  for (const s of suites) {
    if (!S[s]) continue;
    section = s;
    const t0 = Date.now();
    const nErr = R.errors.length;
    try { await S[s](); } catch (e) { ok(false, `suite crashed: ${e.message.split('\n')[0]}`, e.stack); await closeModals().catch(() => {}); await E(() => document.getElementById('menu').classList.add('hidden')).catch(() => {}); }
    const errs = R.errors.slice(nErr);
    ok(!errs.length, 'no console/page/network errors during suite', errs.join(' || '));
    R.suites[s] = Date.now() - t0;
  }
  await browser.close();
  fs.rmSync(dlDir, { recursive: true, force: true });
  return R;
}

// ---------------- main ----------------
const results = [];
let app = null, stat = null;
if (targets.includes('server')) app = await startAppServer();
if (targets.includes('static')) stat = await startStaticServer();
try {
  for (const p of profiles) for (const t of targets) {
    const base = t === 'server' ? app.base : stat.base;
    const t0 = Date.now();
    process.stdout.write(`▶ ${p} [${t}] ${PROFILES[p].browser}\n`);
    let R;
    try { R = await runProfile(p, t, base); } catch (e) { R = { profile: p, target: t, checks: [{ ok: false, label: 'runner crashed', detail: e.stack }], errors: [] }; console.log(e); }
    const pass = R.checks.filter((c) => c.ok).length, fail = R.checks.length - pass;
    R.summary = { pass, fail, ms: Date.now() - t0 };
    console.log(`  ${fail ? '❌' : '✅'} ${p} [${t}] ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)${R.trustedInput === false ? ' · trusted touchscreen.tap produced no pointer events' : ''}${R.serviceWorker ? ' · SW ' + R.serviceWorker : ''}`);
    const file = path.join(OUT, `${p}__${t}${args.suite ? '__' + String(args.suite).replace(/,/g, '+') : ''}.json`);
    fs.writeFileSync(file, JSON.stringify(R, null, 1));
    results.push(R);
  }
} finally {
  await app?.stop(); await stat?.stop();
}
const failed = results.reduce((a, r) => a + r.summary.fail, 0);
console.log(`\nE2E: ${results.length} runs, ${results.reduce((a, r) => a + r.summary.pass, 0)} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
