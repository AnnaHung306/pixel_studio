// Canvas viewport: rendering (composite, onion skin, references, grid, selection) and pointer/gesture input.
import { app, on, emit, setUI, undo, redo, getCelBuf, W, H } from './state.js';
import * as tools from './tools.js';
import { compositeLayers, hexToRgba } from './core/raster.js';
import { capture, claimPencil } from './dom.js';

let canvas, ctx, stage;
let dpr = 1;
const docCanvas = document.createElement('canvas');
const docCtx = docCanvas.getContext('2d');
const onionCache = new Map(); // frameIdx -> {ver, canvas}
const refImages = new Map(); // refId -> {src, img}
let needsRender = true;
let hover = null; // doc coords
let spaceDown = false;

export function initView() {
  canvas = document.getElementById('view');
  stage = document.getElementById('stage');
  ctx = canvas.getContext('2d');
  new ResizeObserver(resize).observe(stage);
  resize();
  on('canvas', () => (needsRender = true));
  on('doc', () => { onionCache.clear(); needsRender = true; });
  on('ui', () => (needsRender = true));
  loop();
  bindInput();
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  needsRender = true;
}

export function fitView() {
  if (!app.doc) return;
  const r = stage.getBoundingClientRect();
  const z = Math.max(0.25, Math.min(64, Math.floor(Math.min((r.width - 40) / W(), (r.height - 40) / H()) * 4) / 4 || 1));
  const zoom = z >= 1 ? Math.floor(z) : z;
  setUI({ zoom, panX: Math.round((r.width - W() * zoom) / 2), panY: Math.round((r.height - H() * zoom) / 2) });
}
export function zoomAt(factor, sx, sy) {
  const r = stage.getBoundingClientRect();
  if (sx === undefined) { sx = r.width / 2; sy = r.height / 2; }
  const z0 = app.ui.zoom;
  let z = z0 * factor;
  const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
  if (factor === 2 || factor === 0.5) {
    z = factor > 1 ? steps.find((s) => s > z0 + 1e-6) || 128 : [...steps].reverse().find((s) => s < z0 - 1e-6) || 0.25;
  }
  z = Math.max(0.25, Math.min(128, z));
  const dx = (sx - app.ui.panX) / z0, dy = (sy - app.ui.panY) / z0;
  setUI({ zoom: z, panX: sx - dx * z, panY: sy - dy * z });
}
export function screenToDoc(sx, sy) {
  return { x: (sx - app.ui.panX) / app.ui.zoom, y: (sy - app.ui.panY) / app.ui.zoom };
}

function loop() {
  if (needsRender && app.doc) { needsRender = false; render(); }
  requestAnimationFrame(loop);
}
export function requestRender() { needsRender = true; }

function bufToCanvas(buf, w, h, c = document.createElement('canvas')) {
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  c.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
  return c;
}

function frameComposite(fi) {
  const m = app.doc.meta;
  return compositeLayers(m.layers.map((L) => ({ visible: L.visible, opacity: L.opacity, blend: L.blend, buf: getCelBuf(L.id, fi) })), m.width, m.height);
}

function onionCanvas(fi, tint) {
  const key = fi + ':' + tint;
  const c = onionCache.get(key);
  if (c && c.ver === app.version) return c.canvas;
  const buf = frameComposite(fi);
  if (tint) {
    const t = hexToRgba(tint);
    for (let i = 0; i < buf.length; i += 4) {
      if (!buf[i + 3]) continue;
      buf[i] = buf[i] * 0.35 + t[0] * 0.65; buf[i + 1] = buf[i + 1] * 0.35 + t[1] * 0.65; buf[i + 2] = buf[i + 2] * 0.35 + t[2] * 0.65;
    }
  }
  const cv = bufToCanvas(buf, W(), H(), c?.canvas);
  onionCache.set(key, { ver: app.version, canvas: cv });
  return cv;
}

function refImage(ref) {
  const src = app.doc.refs.get(ref.id);
  if (!src) return null;
  let e = refImages.get(ref.id);
  if (!e || e.src !== src) {
    const img = new Image();
    img.onload = () => (needsRender = true);
    img.src = src;
    e = { src, img };
    refImages.set(ref.id, e);
  }
  return e.img.complete && e.img.naturalWidth ? e.img : null;
}

function drawRefs(z) {
  for (const r of app.doc.meta.references || []) {
    if (!r.visible) continue;
    const img = refImage(r);
    if (!img) continue;
    ctx.globalAlpha = r.opacity ?? 0.5;
    ctx.imageSmoothingEnabled = !r.pixelated;
    const s = r.scale || 1;
    ctx.drawImage(img, (r.x || 0) * z, (r.y || 0) * z, img.naturalWidth * s * z, img.naturalHeight * s * z);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
  }
}

let checkerPattern = null;
function render() {
  const { zoom: z, panX, panY } = app.ui;
  const w = W(), h = H();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#121218';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, Math.round(panX * dpr), Math.round(panY * dpr));
  ctx.imageSmoothingEnabled = false;

  // checkerboard
  if (!checkerPattern) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#cfcfd6'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#9a9aa6'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    checkerPattern = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = checkerPattern;
  ctx.fillRect(0, 0, w * z, h * z);

  if (!app.ui.refsAbove) drawRefs(z);

  // onion skin
  const o = app.ui.onion;
  if (o.on && !app.ui.playing) {
    const n = app.doc.meta.frames.length;
    for (let d = Math.max(o.prev, o.next); d >= 1; d--) {
      const fall = 1 - (d - 1) / (Math.max(o.prev, o.next) + 1);
      if (d <= o.prev && app.ui.frame - d >= 0) { ctx.globalAlpha = o.opacity * fall; ctx.drawImage(onionCanvas(app.ui.frame - d, o.tint ? o.prevColor : null), 0, 0, w * z, h * z); }
      if (d <= o.next && app.ui.frame + d < n) { ctx.globalAlpha = o.opacity * fall; ctx.drawImage(onionCanvas(app.ui.frame + d, o.tint ? o.nextColor : null), 0, 0, w * z, h * z); }
    }
    ctx.globalAlpha = 1;
  }

  // current frame
  bufToCanvas(frameComposite(app.ui.frame), w, h, docCanvas);
  if (app.ui.tilePreview) {
    ctx.globalAlpha = 0.5;
    for (let ty = -1; ty <= 1; ty++) for (let tx = -1; tx <= 1; tx++) if (tx || ty) ctx.drawImage(docCanvas, tx * w * z, ty * h * z, w * z, h * z);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(docCanvas, 0, 0, w * z, h * z);
  emit('rendered', docCanvas);

  if (app.ui.refsAbove) drawRefs(z);

  // pixel grid
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ox = Math.round(panX * dpr), oy = Math.round(panY * dpr), zz = z * dpr;
  const vis = (x0, y0, x1, y1) => [Math.max(0, x0), Math.max(0, y0), Math.min(canvas.width, x1), Math.min(canvas.height, y1)];
  const [cx0, cy0, cx1, cy1] = vis(ox, oy, ox + w * zz, oy + h * zz);
  if (app.ui.showGrid && z >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.max(1, Math.ceil((cx0 - ox) / zz)); x < w && ox + x * zz <= cx1; x++) { const X = Math.round(ox + x * zz) + 0.5; ctx.moveTo(X, cy0); ctx.lineTo(X, cy1); }
    for (let y = Math.max(1, Math.ceil((cy0 - oy) / zz)); y < h && oy + y * zz <= cy1; y++) { const Y = Math.round(oy + y * zz) + 0.5; ctx.moveTo(cx0, Y); ctx.lineTo(cx1, Y); }
    ctx.stroke();
  }
  const cg = app.ui.customGrid;
  if (cg.on && cg.w > 0 && cg.h > 0) {
    ctx.strokeStyle = cg.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cg.w; x < w; x += cg.w) { const X = Math.round(ox + x * zz) + 0.5; ctx.moveTo(X, cy0); ctx.lineTo(X, cy1); }
    for (let y = cg.h; y < h; y += cg.h) { const Y = Math.round(oy + y * zz) + 0.5; ctx.moveTo(cx0, Y); ctx.lineTo(cx1, Y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  // canvas border
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.strokeRect(ox - 0.5, oy - 0.5, w * zz + 1, h * zz + 1);

  // symmetry axes
  ctx.setLineDash([6, 4]);
  if (app.ui.symX) { ctx.strokeStyle = '#ff5ea8'; ctx.beginPath(); ctx.moveTo(ox + (w / 2) * zz, oy); ctx.lineTo(ox + (w / 2) * zz, oy + h * zz); ctx.stroke(); }
  if (app.ui.symY) { ctx.strokeStyle = '#ff5ea8'; ctx.beginPath(); ctx.moveTo(ox, oy + (h / 2) * zz); ctx.lineTo(ox + w * zz, oy + (h / 2) * zz); ctx.stroke(); }
  ctx.setLineDash([]);

  // selection outline (marching ants)
  if (app.selection) drawSelection(ox, oy, zz);
  if (app.lassoPreview && app.lassoPreview.length > 1) {
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.beginPath();
    app.lassoPreview.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * zz, oy + y * zz) : ctx.moveTo(ox + x * zz, oy + y * zz)));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // brush cursor
  if (hover && ['pencil', 'eraser', 'line', 'rect', 'ellipse'].includes(app.ui.tool) && !tools.isStroking()) {
    const s = app.ui.brushSize, lo = -Math.floor((s - 1) / 2);
    const hx = Math.floor(hover.x) + lo, hy = Math.floor(hover.y) + lo;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox + hx * zz) + 0.5, Math.round(oy + hy * zz) + 0.5, Math.round(s * zz) - 1, Math.round(s * zz) - 1);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(Math.round(ox + hx * zz) - 0.5, Math.round(oy + hy * zz) - 0.5, Math.round(s * zz) + 1, Math.round(s * zz) + 1);
  }
}

let antsOffset = 0;
setInterval(() => { if (app.selection) { antsOffset = (antsOffset + 1) % 8; needsRender = true; } }, 120);
function drawSelection(ox, oy, zz) {
  const { mask } = app.selection;
  const w = W(), h = H();
  ctx.beginPath();
  const m = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const s = app.selection;
  const x0 = Math.max(0, s.x - 1), y0 = Math.max(0, s.y - 1), x1 = Math.min(w, s.x + s.w + 1), y1 = Math.min(h, s.y + s.h + 1);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!m(x, y)) continue;
      const X = ox + x * zz, Y = oy + y * zz;
      if (!m(x, y - 1)) { ctx.moveTo(X, Y + 0.5); ctx.lineTo(X + zz, Y + 0.5); }
      if (!m(x, y + 1)) { ctx.moveTo(X, Y + zz - 0.5); ctx.lineTo(X + zz, Y + zz - 0.5); }
      if (!m(x - 1, y)) { ctx.moveTo(X + 0.5, Y); ctx.lineTo(X + 0.5, Y + zz); }
      if (!m(x + 1, y)) { ctx.moveTo(X + zz - 0.5, Y); ctx.lineTo(X + zz - 0.5, Y + zz); }
    }
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000'; ctx.setLineDash([]); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -antsOffset; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// ---------------- input ----------------
const pointers = new Map();
let mode = null; // 'draw' | 'pan' | 'pinch'
let panStart = null;
let pinch = null;
let tapInfo = null;
let penSeen = false;

function local(e) {
  const r = canvas.getBoundingClientRect();
  return { sx: e.clientX - r.left, sy: e.clientY - r.top };
}
function info(e) {
  return { button: e.button === 2 || (e.buttons & 2 && e.button !== 0) ? 2 : 0, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pointerType: e.pointerType };
}

function bindInput() {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  claimPencil(canvas); // iPadOS Scribble workaround (dom.js)
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', () => { hover = null; needsRender = true; document.getElementById('coords').textContent = ''; });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // Safari: block the page-level pinch zoom / gesture events everywhere (iOS ignores user-scalable=no)
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = ''; } });
}
export const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) && !['range', 'checkbox', 'radio', 'button'].includes(e.target.type);

function onDown(e) {
  capture(canvas, e.pointerId);
  const p = local(e);
  pointers.set(e.pointerId, { ...p, type: e.pointerType, startX: p.sx, startY: p.sy, t: Date.now() });
  if (e.pointerType === 'pen') { if (!penSeen) { penSeen = true; if (!app.ui.penOnly) { setUI({ penOnly: true }); emit('toast', '偵測到觸控筆：已啟用防誤觸（手指只能平移縮放）'); } } }

  const touches = [...pointers.values()].filter((q) => q.type === 'touch');
  if (e.pointerType === 'touch' && touches.length >= 2) {
    // second finger: cancel any stroke and start pinch
    if (mode === 'draw') tools.cancel();
    mode = 'pinch';
    const [a, b] = touches;
    pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2, zoom: app.ui.zoom, panX: app.ui.panX, panY: app.ui.panY, moved: false, count: touches.length, t: Date.now() };
    tapInfo = { count: touches.length, t: Date.now(), moved: false };
    return;
  }
  if (e.button === 1 || spaceDown || app.ui.tool === 'hand' || (e.pointerType === 'touch' && app.ui.penOnly)) {
    mode = 'pan';
    panStart = { sx: p.sx, sy: p.sy, panX: app.ui.panX, panY: app.ui.panY };
    tapInfo = e.pointerType === 'touch' ? { count: 1, t: Date.now(), moved: false } : null;
    return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
  mode = 'draw';
  app.busy = true;
  tools.down(screenToDoc(p.sx, p.sy), info(e));
  armLongPress(e, p);
}

// Long-press (finger / Pencil held still ~0.6s while drawing) = one-shot eyedropper, like Procreate.
let lpTimer = null;
function clearLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }
function armLongPress(e, p) {
  clearLongPress();
  if (e.pointerType === 'mouse' || !['pencil', 'eraser'].includes(app.ui.tool) || app.ui.oneShot || !app.ui.longPressMs) return;
  const id = e.pointerId;
  lpTimer = setTimeout(() => {
    lpTimer = null;
    const ptr = pointers.get(id);
    if (mode !== 'draw' || !ptr || Math.hypot(ptr.sx - p.sx, ptr.sy - p.sy) > 8) return;
    tools.cancel();
    const d = screenToDoc(ptr.sx, ptr.sy), inf = { button: 0, alt: true, pointerType: e.pointerType };
    tools.down(d, inf); tools.up(d, inf);
    mode = null; app.busy = false; emit('idle');
    emit('toast', '已吸取顏色（長按）');
  }, app.ui.longPressMs);
}

function onMove(e) {
  const p = local(e);
  const d = screenToDoc(p.sx, p.sy);
  if (e.pointerType !== 'touch' || mode !== 'pinch') {
    hover = d;
    const x = Math.floor(d.x), y = Math.floor(d.y);
    document.getElementById('coords').textContent = x >= 0 && y >= 0 && x < W() && y < H() ? `${x}, ${y}` : '';
    needsRender = true;
  }
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  ptr.sx = p.sx; ptr.sy = p.sy;
  if (tapInfo && Math.hypot(p.sx - ptr.startX, p.sy - ptr.startY) > 10) tapInfo.moved = true;
  if (mode === 'pinch') {
    const touches = [...pointers.values()].filter((q) => q.type === 'touch');
    if (touches.length < 2) return;
    const [a, b] = touches;
    const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
    const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
    const z = Math.max(0.25, Math.min(128, pinch.zoom * (dist / Math.max(1, pinch.d))));
    const dx = (pinch.cx - pinch.panX) / pinch.zoom, dy = (pinch.cy - pinch.panY) / pinch.zoom;
    setUI({ zoom: z, panX: cx - dx * z, panY: cy - dy * z });
  } else if (mode === 'pan') {
    setUI({ panX: panStart.panX + (p.sx - panStart.sx), panY: panStart.panY + (p.sy - panStart.sy) });
  } else if (mode === 'draw') {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of evs.length ? evs : [e]) {
      const q = local(ce);
      tools.move(screenToDoc(q.sx, q.sy), info(ce));
    }
  }
}

function onUp(e) {
  clearLongPress();
  const ptr = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  const p = local(e);
  // fingers / pens do not hover: don't leave a stale brush cursor behind after lifting
  if (e.pointerType !== 'mouse') { hover = null; needsRender = true; }
  if (mode === 'draw') {
    tools.up(screenToDoc(p.sx, p.sy), info(e));
    app.busy = false;
    mode = null;
    emit('idle');
  } else if (mode === 'pinch' || mode === 'pan') {
    const remaining = [...pointers.values()].filter((q) => q.type === 'touch').length;
    if (remaining === 0) {
      // two-finger tap = undo, three-finger tap = redo
      if (tapInfo && !tapInfo.moved && Date.now() - tapInfo.t < 300) {
        if (tapInfo.count === 2) undo();
        else if (tapInfo.count >= 3) redo();
      }
      tapInfo = null;
      mode = null;
    } else if (mode === 'pinch' && remaining === 1) {
      // keep pinching state until all fingers lift (avoid accidental strokes)
    }
    if (pointers.size === 0) mode = null;
  }
  if (ptr && ptr.type === 'touch' && tapInfo && pinch && pointers.size > 0) tapInfo.count = Math.max(tapInfo.count, pinch.count);
}
function onCancel(e) {
  clearLongPress();
  pointers.delete(e.pointerId);
  if (mode === 'draw') {
    // Apple Pencil: a system gesture / palm event can cancel the pointer mid-stroke. Keep what was drawn
    // (one undo step) instead of silently discarding it; a cancelled finger stroke is still dropped (likely accidental).
    if (e.pointerType === 'pen') { const p = local(e); tools.up(screenToDoc(p.sx, p.sy), info(e)); }
    else tools.cancel();
    app.busy = false; emit('idle');
  }
  if (pointers.size === 0) mode = null;
}
function onWheel(e) {
  e.preventDefault();
  const p = local(e);
  if (e.shiftKey && !e.ctrlKey) { setUI({ panX: app.ui.panX - (e.deltaY || e.deltaX) }); return; }
  // trackpads send small pixel deltas: pan unless ctrl (pinch)
  const isTrackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && (Math.abs(e.deltaX) > 0 || !Number.isInteger(e.deltaY));
  if (isTrackpadPan) { setUI({ panX: app.ui.panX - e.deltaX, panY: app.ui.panY - e.deltaY }); return; }
  const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
  zoomAt(factor, p.sx, p.sy);
}

export function getDocCanvas() { return docCanvas; }
