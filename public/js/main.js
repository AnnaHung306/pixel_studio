// Pixel Studio — app bootstrap: wiring, menus, keyboard shortcuts, autosave, playback.
import { app, on, emit, setDoc, newDoc, undo, redo, setUI, toast, historyBytes } from './state.js';
import { initView, fitView, zoomAt, getDocCanvas, isTyping } from './view.js';
import * as P from './panels.js';
import * as T from './tools.js';
import * as A from './actions.js';
import * as D from './dialogs.js';
import * as io from './io.js';
import * as store from './storage.js';
import { cloud, detectServer, onDocOpened, syncNow, loggedIn } from './cloud.js';
import { h, popupMenu, prompt, capture, isIOS, a11yLabel } from './dom.js';
import { APP_VERSION } from './version.js';
import * as diag from './diag.js';
import * as notices from './notices.js';

// ---------- open / autosave (state machine: saved → dirty → saving → saved | error) ----------
// Every change bumps `rev`; a save records the rev it wrote, so a change made while saving is never lost.
const save = { state: 'saved', rev: 0, savedRev: 0, error: null, quota: false, lastSaved: 0, retryMs: 0, retryTimer: null, warnedUsage: false };
let saveTimer = null, saving = null;
function setSaveState(st, err = null) {
  save.state = st; save.error = err;
  const t = document.getElementById('doc-title');
  if (t) t.dataset.save = st;
  const label = { saved: '已儲存', dirty: '有未儲存的變更', saving: '儲存中…', error: '儲存失敗' }[st];
  const live = document.getElementById('save-status');
  if (live && live.textContent !== label) live.textContent = label;
  if (t) t.title = `${label} · 點擊重新命名`;
  renderSaveBanner();
}
async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!app.doc) return;
  while (saving) { await saving.catch(() => {}); if (save.rev === save.savedRev && save.state !== 'error') return; }
  const rev = save.rev;
  setSaveState('saving');
  saving = (async () => {
    try {
      await store.saveProject(app.doc, thumbnail());
      save.savedRev = rev; save.lastSaved = Date.now(); save.retryMs = 0; save.quota = false;
      clearTimeout(save.retryTimer); save.retryTimer = null;
      setSaveState(save.rev === rev ? 'saved' : 'dirty');
      checkStorageUsage();
    } catch (e) {
      save.quota = store.isQuotaError(e);
      console.info('[autosave] failed:', e?.name || '', e?.message || e);
      diag.record('warn', `自動儲存失敗：${e?.name || ''} ${e?.message || e}`);
      setSaveState('error', e);
      scheduleRetry();
    }
  })();
  try { await saving; } finally { saving = null; }
  if (save.state === 'dirty') scheduleSave(200);
}
function scheduleSave(ms = 800) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, ms); }
function scheduleRetry() {
  clearTimeout(save.retryTimer);
  save.retryMs = Math.min(60000, save.retryMs ? save.retryMs * 2 : 4000);
  save.retryTimer = setTimeout(() => { save.retryTimer = null; if (save.state === 'error') saveNow(); }, save.retryMs);
}
function markDirty() {
  save.rev++;
  if (save.state !== 'error') setSaveState('dirty');
  if (save.state === 'error') return; // retry loop owns saving while failing
  scheduleSave();
}
async function checkStorageUsage() {
  if (save.warnedUsage) return;
  const i = await store.storageInfo();
  if (i.usage != null && i.quota && i.usage / i.quota > 0.8) {
    save.warnedUsage = true;
    toast(`儲存空間已使用 ${Math.round((i.usage / i.quota) * 100)}%，建議下載備份並刪除不用的專案`, 'warn');
  }
}
function renderSaveBanner() {
  const b = document.getElementById('save-banner');
  if (!b) return;
  if (save.state !== 'error') { if (!b.classList.contains('hidden')) b.classList.add('hidden'); return; }
  const why = save.quota ? '裝置儲存空間不足，作品沒有存到這台裝置。' : '作品沒有存到這台裝置（' + (save.error?.message || '未知錯誤') + '）。';
  const msg = b.querySelector('.msg');
  const text = why + '請先下載備份。';
  if (msg.textContent !== text) msg.textContent = text;
  b.classList.remove('hidden');
}
function buildNoticeBar() {
  const b = h('div', { id: 'notice-bar', class: 'hidden', role: 'status' });
  document.getElementById('app').insertBefore(b, document.getElementById('optionsbar'));
  notices.init({ backup: () => io.exportPxs() });
}
function buildSaveBanner() {
  const b = h('div', { id: 'save-banner', class: 'hidden', role: 'alert' },
    h('span', { class: 'msg' }),
    h('span', { class: 'acts' },
      h('button', { class: 'btn primary', 'data-act': 'backup', onclick: () => io.exportPxs() }, '下載 .pxs 備份'),
      h('button', { class: 'btn', 'data-act': 'retry', onclick: () => { save.retryMs = 0; saveNow(); } }, '重試'),
      h('button', { class: 'btn', 'data-act': 'manage', onclick: () => D.projectsDialog() }, '管理專案')));
  document.getElementById('app').insertBefore(b, document.getElementById('optionsbar'));
  const live = h('div', { id: 'save-status', class: 'sr-only', 'aria-live': 'polite' });
  document.body.append(live);
}
on('dirty', markDirty);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow(); });
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
window.addEventListener('beforeunload', (e) => { if (save.state === 'error' || save.state === 'dirty' || save.state === 'saving') { if (saveTimer) saveNow(); e.preventDefault(); e.returnValue = ''; } });

function thumbnail() {
  try {
    const src = getDocCanvas();
    if (!src.width) return null;
    const s = Math.max(1, Math.floor(96 / Math.max(src.width, src.height)));
    const c = document.createElement('canvas');
    c.width = Math.min(96, src.width * s); c.height = Math.min(96, src.height * s);
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch { return null; }
}

async function openDoc(doc) {
  if (app.doc && saveTimer) await saveNow();
  stopPlay();
  setDoc(doc);
  fitView();
  onDocOpened();
  store.setSetting('lastProject', doc.meta.id);
  save.rev++;
  await saveNow();
}
D.hooks.openDoc = openDoc;
on('replaceDoc', (doc) => { setDoc(doc, { keepHistory: false }); onDocOpened(); save.rev++; saveNow(); toast('已載入伺服器上較新的版本'); });
on('fit', () => fitView());
on('saveCopy', (doc) => store.saveProject(doc, null).catch(() => {}));

// ---------- toast ----------
on('toast', (t) => {
  const { msg, cls } = typeof t === 'string' ? { msg: t, cls: '' } : t;
  const root = document.getElementById('toast');
  const el = h('div', { class: 'toast ' + (cls || '') }, msg);
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => el.remove(), cls === 'ai' ? 3500 : cls === 'warn' ? 4500 : 1800);
});

// ---------- panels refresh ----------
let uiQueued = false;
function refreshUI() {
  if (uiQueued) return;
  uiQueued = true;
  requestAnimationFrame(() => {
    uiQueued = false;
    if (!app.doc) return;
    P.renderToolbar(); P.renderOptions(); P.renderColorEditor(); P.renderPalette(); P.renderOnion(); P.renderFloatActions();
    document.getElementById('btn-grid').classList.toggle('on', app.ui.showGrid);
    document.getElementById('btn-zoom').textContent = Math.round(app.ui.zoom * 100) + '%';
  });
}
let docQueued = false;
function refreshDoc() {
  if (docQueued) return;
  docQueued = true;
  requestAnimationFrame(() => {
    docQueued = false;
    if (!app.doc) return;
    P.renderTimeline(); P.renderRefs(); P.renderPalette();
    const dt = document.getElementById('doc-title');
    dt.textContent = app.doc.meta.name + `  ${app.doc.meta.width}×${app.doc.meta.height}`;
    dt.dataset.save = save.state;
    document.title = `${app.doc.meta.name} — Pixel Studio`;
  });
}
let lastUiKey = '';
on('ui', (patch) => {
  // zoom/pan changes only need the zoom label
  const keys = Object.keys(patch || {});
  if (keys.length && keys.every((k) => ['zoom', 'panX', 'panY'].includes(k))) { document.getElementById('btn-zoom').textContent = Math.round(app.ui.zoom * 100) + '%'; return; }
  if (keys.includes('frame') || keys.includes('layerId') || keys.includes('playTag')) refreshDoc();
  refreshUI();
});
on('doc', refreshDoc);
on('history', () => P.renderHistory());
on('selection', () => P.renderFloatActions());
on('canvas', () => { if (app.floating) P.renderFloatActions(); });
let pvT = 0;
on('rendered', (c) => { const now = performance.now(); if (now - pvT > 60 || app.ui.playing) { pvT = now; P.renderPreview(c); } });
on('cloud', (s) => {
  const dot = document.getElementById('cloud-dot');
  dot.className = 'dot ' + ({ live: 'on', connecting: 'warn', error: 'warn', ready: 'warn', nologin: 'off', off: 'off' }[s] || 'off');
  document.getElementById('btn-cloud').title = { off: '單機模式（未偵測到伺服器）', nologin: '伺服器：未登入', ready: '伺服器：已登入（目前專案未同步）', connecting: '連線中…', live: '即時同步中', error: '同步錯誤，重試中' }[s];
});

// ---------- playback ----------
let playRAF = null, playDir = 1, playAcc = 0, playLast = 0;
function playRange() {
  const t = app.doc.meta.tags.find((x) => x.id === app.ui.playTag);
  return t ? [t.from, Math.min(t.to, app.doc.meta.frames.length - 1), t.direction] : [0, app.doc.meta.frames.length - 1, 'forward'];
}
function startPlay() {
  if (app.doc.meta.frames.length < 2) return toast('只有一個影格');
  T.dropFloating();
  app.ui.playing = true;
  const [a, b, dir] = playRange();
  playDir = dir === 'reverse' ? -1 : 1;
  if (app.ui.frame < a || app.ui.frame > b) app.ui.frame = playDir > 0 ? a : b;
  playAcc = 0; playLast = performance.now();
  const tick = (now) => {
    if (!app.ui.playing) return;
    playAcc += (now - playLast) * (app.ui.speed || 1);
    playLast = now;
    const dur = app.doc.meta.frames[app.ui.frame]?.duration || 100;
    if (playAcc >= dur) {
      playAcc -= dur;
      if (playAcc > 1000) playAcc = 0;
      const [s, e, d] = playRange();
      let n = app.ui.frame + playDir;
      const mode = d === 'pingpong' ? 'pingpong' : app.ui.loopMode;
      if (n > e || n < s) {
        if (mode === 'pingpong') { playDir = -playDir; n = app.ui.frame + playDir; if (n > e || n < s) n = app.ui.frame; }
        else if (mode === 'once') { stopPlay(); return; }
        else n = playDir > 0 ? s : e;
      }
      app.ui.frame = n;
      highlightFrame();
      emit('canvas');
    }
    playRAF = requestAnimationFrame(tick);
  };
  playRAF = requestAnimationFrame(tick);
  P.renderTimeline();
}
function stopPlay() {
  if (!app.ui.playing) return;
  app.ui.playing = false;
  cancelAnimationFrame(playRAF);
  emit('doc'); emit('canvas');
}
function highlightFrame() {
  document.querySelectorAll('.tl-fh').forEach((el, i) => el.classList.toggle('cur', i === app.ui.frame));
}
on('togglePlay', () => (app.ui.playing ? stopPlay() : startPlay()));

// ---------- focus mode (1.6.0) ----------
export function toggleFocus(on) {
  const appEl = document.getElementById('app');
  const next = on === undefined ? !appEl.classList.contains('focus') : !!on;
  appEl.classList.toggle('focus', next);
  const b = document.getElementById('btn-focus');
  b.classList.toggle('on', next); b.setAttribute('aria-pressed', String(next));
  document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open'));
  if (next) toast('專注模式：再按 Tab 或「離開專注」返回');
  requestAnimationFrame(() => fitView());
}

// ---------- top bar ----------
function bindTopbar() {
  const $ = (id) => document.getElementById(id);
  $('btn-undo').onclick = () => undo();
  $('btn-redo').onclick = () => redo();
  $('btn-zoom-in').onclick = () => zoomAt(2);
  $('btn-zoom-out').onclick = () => zoomAt(0.5);
  $('btn-zoom').onclick = () => fitView();
  $('btn-grid').onclick = () => setUI({ showGrid: !app.ui.showGrid });
  $('btn-focus').onclick = () => toggleFocus();
  const oneShot = (id) => setUI({ oneShot: app.ui.oneShot === id ? null : id });
  $('qt-pick').onclick = () => oneShot('eyedropper');
  $('qt-erase').onclick = () => oneShot('eraser');
  on('ui', () => { for (const [b, t] of [['qt-pick', 'eyedropper'], ['qt-erase', 'eraser']]) { const el = $(b); el.classList.toggle('on', app.ui.oneShot === t); el.setAttribute('aria-pressed', String(app.ui.oneShot === t)); } });
  $('fp-exit').onclick = () => toggleFocus(false);
  $('fp-undo').onclick = () => undo();
  $('fp-redo').onclick = () => redo();
  $('btn-cloud').onclick = () => D.serverDialog();
  $('btn-menu').onclick = (e) => mainMenu(e.currentTarget);
  $('doc-title').onclick = async () => { const n = await prompt('重新命名專案', app.doc.meta.name); if (n && n.trim()) A.renameProject(n.trim()); };
  const sheet = (id, scrollTo) => {
    const el = $(id);
    const open = !el.classList.contains('open');
    document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open'));
    if (open) { el.classList.add('open'); if (scrollTo) $(scrollTo).scrollIntoView({ block: 'start' }); else el.scrollTop = 0; if (id === 'timeline') P.renderTimeline(); }
  };
  $('btn-sheet-color').onclick = () => sheet('sidepanel', 'panel-color');
  $('btn-sheet-side').onclick = () => sheet('sidepanel', 'panel-preview');
  $('btn-sheet-timeline').onclick = () => sheet('timeline');
  $('stage').addEventListener('pointerdown', () => document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')));
  $('btn-add-ref').onclick = () => D.importReference();
  // swipe down to close sheet
  document.querySelectorAll('.sheet-handle').forEach((hd) => {
    let y0 = null;
    hd.addEventListener('pointerdown', (e) => { y0 = e.clientY; capture(hd, e.pointerId); });
    hd.addEventListener('pointerup', (e) => { if (y0 !== null && e.clientY - y0 > 30) hd.parentElement.classList.remove('open'); y0 = null; });
  });
}

function mainMenu(anchor) {
  popupMenu(anchor, [
    { header: '檔案' },
    { label: '新增專案…', key: 'Ctrl+N', action: D.newProjectDialog },
    { label: '專案列表…', key: 'Ctrl+O', action: D.projectsDialog },
    { label: '開啟 / 匯入檔案（.pxs、PNG、GIF）…', action: () => D.importDialog() },
    { label: '立即儲存', key: 'Ctrl+S', action: manualSave },
    { label: '下載專案檔 .pxs', key: 'Ctrl+Shift+S', action: io.exportPxs },
    { label: '匯出（PNG / GIF / APNG / 精靈圖）…', key: 'Ctrl+Shift+E', action: D.exportDialog },
    { label: '匯入參考圖…', action: () => D.importReference() },
    '-',
    { header: '編輯' },
    { label: '畫布大小 / 縮放…', action: D.canvasSizeDialog },
    { label: '裁切到選取範圍', action: A.cropToSelection },
    { label: '全選', key: 'Ctrl+A', action: T.selectAll },
    { label: '取消選取', key: 'Ctrl+D', action: T.deselect },
    { label: '反轉選取', key: 'Ctrl+Shift+I', action: T.invertSelection },
    { label: '水平翻轉（選取或整個 cel）', key: 'Shift+H', action: () => T.transformSelection('flipH') },
    { label: '垂直翻轉', key: 'Shift+V', action: () => T.transformSelection('flipV') },
    { label: '順時針旋轉 90°', action: () => T.transformSelection('rotCW') },
    '-',
    { header: '檢視' },
    { label: '符合視窗', key: '0', action: fitView },
    { label: '放大 / 縮小', key: '+ / −', action: () => zoomAt(2) },
    { label: app.ui.showGrid ? '隱藏像素格線' : '顯示像素格線', key: "Ctrl+'", action: () => setUI({ showGrid: !app.ui.showGrid }) },
    { label: '自訂格線…', action: gridDialog },
    { label: '長按吸色：' + (app.ui.longPressMs ? (app.ui.longPressMs / 1000) + ' 秒（點此切換）' : '關閉（點此切換）'), action: () => {
      const seq = [400, 600, 900, 0]; const n = seq[(seq.indexOf(app.ui.longPressMs) + 1) % seq.length];
      setUI({ longPressMs: n }); toast(n ? `長按吸色：${n / 1000} 秒` : '長按吸色：已關閉');
    } },
    { label: '專注模式（畫布最大化）', key: 'Tab', action: () => toggleFocus() },
    '-',
    { label: '伺服器 · 雲端 · AI API…', action: () => D.serverDialog() },
    { label: '快捷鍵說明', action: D.shortcutsDialog },
    { label: '加入主畫面（離線、較不會被清除）…', action: notices.installHelp },
    { label: '診斷資訊（回報問題用）…', action: diagDialog },
    { label: '關於 Pixel Studio', action: about },
  ]);
}
async function manualSave() {
  T.dropFloating();
  save.retryMs = 0;
  if (save.rev === save.savedRev) save.rev++; // force a write even when nothing changed
  await saveNow();
  if (save.state === 'error') return toast('儲存失敗：' + (save.quota ? '儲存空間不足' : save.error?.message || '未知錯誤'), 'warn');
  if (app.doc.cloud && loggedIn()) await syncNow();
  toast(app.doc.cloud && loggedIn() ? '已儲存（本機 + 伺服器）' : '已儲存到此瀏覽器');
}
function gridDialog() {
  const g = app.ui.customGrid;
  const on = h('input', { type: 'checkbox', checked: g.on });
  const w = h('input', { type: 'number', min: 1, value: g.w }), hh = h('input', { type: 'number', min: 1, value: g.h });
  const c = h('input', { type: 'color', value: g.color });
  import('./dom.js').then(({ modal }) => modal({
    title: '自訂格線',
    body: h('div', {}, h('label', {}, on, ' 顯示自訂格線'), h('div', { class: 'row' }, h('label', {}, '寬'), w, h('label', {}, '高'), hh, h('label', {}, '顏色'), c)),
    buttons: [{ label: '取消', value: null }, { label: '套用', class: 'primary', onClick: () => setUI({ customGrid: { on: on.checked, w: Math.max(1, +w.value | 0), h: Math.max(1, +hh.value | 0), color: c.value } }) }],
  }));
}
const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
async function about() {
  const si = await store.storageInfo();
  const storeLine = si.usage != null && si.quota ? `儲存空間：已用 ${fmtMB(si.usage)} / 可用 ${fmtMB(si.quota)}` : '儲存空間：瀏覽器未提供';
  const persistLine = si.persisted == null ? '持久儲存：不支援' : si.persisted ? '持久儲存：已啟用（瀏覽器不會自動清除）' : '持久儲存：未啟用（建議加入主畫面並定期下載備份）';
  const lastLine = save.lastSaved ? `最後儲存：${new Date(save.lastSaved).toLocaleTimeString()}` : '最後儲存：—';
  const lb = await notices.backupInfo();
  const backupLine = `最後備份（.pxs）：${lb ? new Date(lb).toLocaleString() : '尚未備份'}`;
  const modeLine = `執行方式：${notices.isStandalone() ? '主畫面 App' : '瀏覽器分頁'}`;
  import('./dom.js').then(({ modal }) => modal({
    title: '關於 Pixel Studio',
    body: h('div', {}, h('p', {}, `Pixel Studio ${APP_VERSION} — 觸控優先的像素繪圖與動畫工具（PWA）。`),
      h('p', { class: 'small' }, `模式：${cloud.available ? (loggedIn() ? '已連線伺服器' : '偵測到伺服器（未登入）') : '單機（資料存在此瀏覽器）'}`),
      h('p', { class: 'small', id: 'about-storage' }, storeLine), h('p', { class: 'small' }, persistLine), h('p', { class: 'small' }, lastLine), h('p', { class: 'small', id: 'about-backup' }, backupLine), h('p', { class: 'small' }, modeLine),
      h('p', { class: 'small' }, '可「加入主畫面」離線使用（需 HTTPS 或 localhost 才能離線快取）。')),
  }));
}

// ---------- diagnostics (1.4.0) ----------
function diagContext() {
  const m = app.doc?.meta;
  const MB = (b) => (b / 1048576).toFixed(1) + ' MB';
  return {
    project: m ? { size: `${m.width}×${m.height}`, layers: m.layers.length, frames: m.frames.length, celCount: app.doc.cels.size, pixelMB: MB([...app.doc.cels.values()].reduce((a, b) => a + b.byteLength, 0)), refs: app.doc.refs.size, cloud: !!app.doc.cloud } : null,
    history: { steps: app.history.undo.length, redo: app.history.redo.length, memory: MB(historyBytes()), budget: MB(app.history.budget), trimmed: app.history.trimmed },
    save: { state: save.state, lastSaved: save.lastSaved ? new Date(save.lastSaved).toISOString() : null, error: save.error ? `${save.error.name || ''} ${save.error.message || ''}`.trim() : null },
    server: { available: !!cloud.available, loggedIn: loggedIn() },
  };
}
async function diagDialog() {
  const env = await diag.environment(diagContext());
  const text = diag.formatReport(env);
  const { modal } = await import('./dom.js');
  const pre = h('pre', { class: 'diag-text', id: 'diag-text', tabindex: 0 }, text);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('已複製診斷資訊'); }
    catch { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('請長按選取的文字並拷貝'); }
  };
  const dl = () => { const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); import('./dom.js').then(({ download }) => download(new Blob([JSON.stringify(diag.reportObject(env), null, 2)], { type: 'application/json' }), `pixel-studio-diagnostics-${stamp}.json`)); };
  modal({
    title: '診斷資訊',
    wide: true,
    body: h('div', {}, h('p', { class: 'small' }, '回報問題時請附上這段資訊與 iPad 型號、iPadOS 版本。內容不含你的作品，也不會自動傳送到任何地方。'), pre),
    buttons: [{ label: '下載診斷檔', onClick: () => { dl(); return false; } }, { label: '複製', class: 'primary', onClick: () => { copy(); return false; } }],
  });
}
let errToastAt = 0;
diag.onRecord((e) => {
  if (e.level !== 'error') return;
  const now = Date.now();
  if (now - errToastAt < 10000) return;
  errToastAt = now;
  toast('發生錯誤，可到「☰ → 診斷資訊」查看並回報', 'warn');
});

// ---------- keyboard ----------
const toolKeys = { b: 'pencil', e: 'eraser', g: 'fill', i: 'eyedropper', l: 'line', u: 'rect', o: 'ellipse', m: 'select', q: 'lasso', v: 'move', h: 'hand' };
let pasteHandled = false;
function onKey(e) {
  if (isTyping(e) || document.querySelector('#modal-root .backdrop')) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const done = () => { e.preventDefault(); e.stopPropagation(); };
  if (ctrl) {
    if (k === 'z' && !e.shiftKey) { done(); if (app.floating) T.cancelFloating(); else undo(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { done(); redo(); return; }
    if (k === 'c') { done(); T.copySelection(); return; }
    if (k === 'x') { done(); T.cutSelection(); return; }
    if (k === 'v') { pasteHandled = false; setTimeout(() => { if (!pasteHandled) T.pasteClip(); }, 80); return; }
    if (k === 'a') { done(); T.selectAll(); return; }
    if (k === 'd') { done(); T.deselect(); return; }
    if (k === 'i' && e.shiftKey) { done(); T.invertSelection(); return; }
    if (k === 's') { done(); e.shiftKey ? io.exportPxs() : manualSave(); return; }
    if (k === 'e') { done(); e.shiftKey ? D.exportDialog() : A.mergeDown(); return; }
    if (k === 'n') { done(); D.newProjectDialog(); return; }
    if (k === 'o') { done(); D.projectsDialog(); return; }
    if (e.key === "'") { done(); setUI({ showGrid: !app.ui.showGrid }); return; }
    if (k === '0') { done(); fitView(); return; }
    return;
  }
  if (e.altKey) {
    if (k === 'n') { done(); A.addFrame(false); return; }
    if (k === 'd') { done(); A.addFrame(true); return; }
    return;
  }
  if (e.shiftKey && k === 'u') { done(); P.setTool('ellipse'); return; }
  if (e.shiftKey && k === 'h') { done(); T.transformSelection('flipH'); return; }
  if (e.shiftKey && k === 'v') { done(); T.transformSelection('flipV'); return; }
  if (e.shiftKey && k === 'n') { done(); A.addLayer(); return; }
  if (toolKeys[k] && !e.shiftKey) { done(); P.setTool(toolKeys[k]); return; }
  switch (e.key) {
    case '<': done(); P.shade(-1); return;
    case '>': done(); P.shade(1); return;
    case 'x': case 'X': done(); P.swapColors(); return;
    case '[': done(); setUI({ brushSize: Math.max(1, app.ui.brushSize - 1) }); return;
    case ']': done(); setUI({ brushSize: Math.min(32, app.ui.brushSize + 1) }); return;
    case '+': case '=': done(); zoomAt(2); return;
    case '-': case '_': done(); zoomAt(0.5); return;
    case '0': done(); fitView(); return;
    case ',': done(); A.selectFrame(app.ui.frame - 1); return;
    case '.': done(); A.selectFrame(app.ui.frame + 1); return;
    case 'F3': done(); setUI({ onion: { ...app.ui.onion, on: !app.ui.onion.on } }); return;
    case 'Delete': case 'Backspace': done(); T.deleteSelection(); return;
    case 'Tab': done(); toggleFocus(); return;
    case 'Escape': done(); if (app.floating) T.cancelFloating(); else T.deselect(); return;
    case 'Enter': done(); if (app.floating) T.dropFloating(); else emit('togglePlay'); return;
    case 'ArrowLeft': if (T.nudge(-1, 0)) done(); else { done(); A.selectFrame(app.ui.frame - 1); } return;
    case 'ArrowRight': if (T.nudge(1, 0)) done(); else { done(); A.selectFrame(app.ui.frame + 1); } return;
    case 'ArrowUp': if (T.nudge(0, -1)) done(); return;
    case 'ArrowDown': if (T.nudge(0, 1)) done(); return;
  }
}

// ---------- system clipboard / drag & drop ----------
document.addEventListener('paste', async (e) => {
  if (isTyping(e)) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  pasteHandled = true;
  e.preventDefault();
  try {
    const f = item.getAsFile();
    const img = await io.decodeImageFile(new File([f], 'clip.png', { type: f.type }));
    T.pasteClip(T.clipFromImageData(img.frames[0].buf, img.w, img.h), [0, 0]);
  } catch (err) { toast('無法貼上圖片：' + err.message); }
});
on('clipboard', async (clip) => {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
    const c = document.createElement('canvas'); c.width = clip.w; c.height = clip.h;
    c.getContext('2d').putImageData(new ImageData(clip.buf.slice(), clip.w, clip.h), 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {}
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (/\.(hex|gpl)$/i.test(f.name)) return toast('調色盤檔請從調色盤選單 ▾ 匯入');
  D.importFile(f);
});

// ---------- boot ----------
// Touch UI (ADR-002): 44pt targets on iOS/iPadOS and any coarse primary pointer. Set before the first render.
export function applyTouchClass() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch', !!(isIOS || coarse));
}
async function boot() {
  diag.installErrorCapture();
  diag.record('info', `啟動 ${APP_VERSION}`);
  applyTouchClass();
  document.querySelectorAll('button[title]').forEach(a11yLabel);
  document.getElementById('view').setAttribute('role', 'img');
  document.getElementById('view').setAttribute('aria-label', '像素畫布');
  document.getElementById('toolbar').setAttribute('role', 'toolbar');
  document.getElementById('toolbar').setAttribute('aria-label', '繪圖工具');
  buildSaveBanner();
  buildNoticeBar();
  initView();
  bindTopbar();
  window.addEventListener('keydown', onKey);
  // restore UI prefs
  const prefs = await store.getSetting('uiPrefs');
  if (prefs) Object.assign(app.ui, prefs, { playing: false, tool: prefs.tool || 'pencil' });
  on('ui', () => {
    clearTimeout(boot.pt);
    boot.pt = setTimeout(() => {
      const { primary, secondary, brushSize, brushShape, pixelPerfect, showGrid, customGrid, onion, refsAbove, penOnly, loopMode, tool, fillContiguous, shapeFilled, symX, symY, dither, longPressMs } = app.ui;
      store.setSetting('uiPrefs', { primary, secondary, brushSize, brushShape, pixelPerfect, showGrid, customGrid, onion, refsAbove, penOnly, loopMode, tool, fillContiguous, shapeFilled, symX, symY, dither, longPressMs });
    }, 500);
  });
  let doc = null;
  const last = await store.getSetting('lastProject');
  if (last) doc = await store.loadProject(last).catch(() => null);
  if (!doc) { doc = newDoc({ name: '未命名', width: 32, height: 32 }); }
  const keepColors = prefs ? { primary: app.ui.primary, secondary: app.ui.secondary } : null;
  await openDoc(doc);
  if (keepColors) setUI(keepColors);
  detectServer().then(() => onDocOpened());
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
  // ask the browser not to evict IndexedDB under storage pressure (Safari may otherwise clear site data)
  navigator.storage?.persist?.().catch(() => {});
  notices.check().catch((e) => diag.record('warn', 'notices: ' + e.message));
  window.__pixelStudio = { app, T, A, io, D, P, store, cloud, setUI, undo, redo, save, saveNow, diag, notices };
}
boot().catch((e) => { console.error(e); diag.record('error', '啟動失敗：' + e.message, e.stack); toast('啟動失敗：' + e.message); });
