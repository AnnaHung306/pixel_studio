// Pixel Studio — app bootstrap: wiring, menus, keyboard shortcuts, autosave, playback.
import { app, on, emit, setDoc, newDoc, undo, redo, setUI, toast } from './state.js';
import { initView, fitView, zoomAt, getDocCanvas, isTyping } from './view.js';
import * as P from './panels.js';
import * as T from './tools.js';
import * as A from './actions.js';
import * as D from './dialogs.js';
import * as io from './io.js';
import * as store from './storage.js';
import { cloud, detectServer, onDocOpened, syncNow, loggedIn } from './cloud.js';
import { h, popupMenu, prompt, capture } from './dom.js';

// ---------- open / autosave ----------
let saveTimer = null;
async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!app.doc) return;
  try { await store.saveProject(app.doc, thumbnail()); } catch (e) { console.warn('autosave failed', e); }
}
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
on('dirty', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 800); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow(); });
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

async function openDoc(doc) {
  if (app.doc && saveTimer) await saveNow();
  stopPlay();
  setDoc(doc);
  fitView();
  onDocOpened();
  store.setSetting('lastProject', doc.meta.id);
  await saveNow();
}
D.hooks.openDoc = openDoc;
on('replaceDoc', (doc) => { setDoc(doc, { keepHistory: false }); onDocOpened(); saveNow(); toast('已載入伺服器上較新的版本'); });
on('fit', () => fitView());
on('saveCopy', (doc) => store.saveProject(doc, null).catch(() => {}));

// ---------- toast ----------
on('toast', (t) => {
  const { msg, cls } = typeof t === 'string' ? { msg: t, cls: '' } : t;
  const root = document.getElementById('toast');
  const el = h('div', { class: 'toast ' + (cls || '') }, msg);
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => el.remove(), cls === 'ai' ? 3500 : 1800);
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
    document.getElementById('doc-title').textContent = app.doc.meta.name + `  ${app.doc.meta.width}×${app.doc.meta.height}`;
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

// ---------- top bar ----------
function bindTopbar() {
  const $ = (id) => document.getElementById(id);
  $('btn-undo').onclick = () => undo();
  $('btn-redo').onclick = () => redo();
  $('btn-zoom-in').onclick = () => zoomAt(2);
  $('btn-zoom-out').onclick = () => zoomAt(0.5);
  $('btn-zoom').onclick = () => fitView();
  $('btn-grid').onclick = () => setUI({ showGrid: !app.ui.showGrid });
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
    { label: '自訂格線…', action: gridDialog },
    '-',
    { label: '伺服器 · 雲端 · AI API…', action: () => D.serverDialog() },
    { label: '快捷鍵說明', action: D.shortcutsDialog },
    { label: '關於 Pixel Studio', action: about },
  ]);
}
async function manualSave() {
  T.dropFloating();
  await saveNow();
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
function about() {
  import('./dom.js').then(({ modal }) => modal({
    title: '關於 Pixel Studio',
    body: h('div', {}, h('p', {}, 'Pixel Studio 0.1 — 觸控優先的像素繪圖與動畫工具（PWA）。'),
      h('p', { class: 'small' }, `模式：${cloud.available ? (loggedIn() ? '已連線伺服器' : '偵測到伺服器（未登入）') : '單機（資料存在此瀏覽器）'}`),
      h('p', { class: 'small' }, '可「加入主畫面」離線使用（需 HTTPS 或 localhost 才能離線快取）。')),
  }));
}

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
async function boot() {
  initView();
  bindTopbar();
  window.addEventListener('keydown', onKey);
  // restore UI prefs
  const prefs = await store.getSetting('uiPrefs');
  if (prefs) Object.assign(app.ui, prefs, { playing: false, tool: prefs.tool || 'pencil' });
  on('ui', () => {
    clearTimeout(boot.pt);
    boot.pt = setTimeout(() => {
      const { primary, secondary, brushSize, brushShape, pixelPerfect, showGrid, customGrid, onion, refsAbove, penOnly, loopMode, tool, fillContiguous, shapeFilled } = app.ui;
      store.setSetting('uiPrefs', { primary, secondary, brushSize, brushShape, pixelPerfect, showGrid, customGrid, onion, refsAbove, penOnly, loopMode, tool, fillContiguous, shapeFilled });
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
  window.__pixelStudio = { app, T, A, io, D, P, store, cloud, setUI, undo, redo };
}
boot().catch((e) => { console.error(e); toast('啟動失敗：' + e.message); });
