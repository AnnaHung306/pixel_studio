// Interactive drawing tools, selection and floating-selection logic.
import { app, emit, commit, activeLayer, activeKey, activeFrame, W, H, setUI, toast, getCelBuf } from './state.js';
import {
  createBuffer, setPixel, getPixel, linePoints, rectPoints, ellipsePoints, floodFill, ditherHit, polygonMask,
  pasteOver, flipBuffer, rotateBuffer, reframe, wrapShift, isEmpty, compositeLayers, rgbaToHex, celKey, b64ToBytes,
} from './core/raster.js';
import { shadeStep, nearestPaletteColor } from './core/palettes.js';

export const TOOLS = [
  { id: 'pencil', label: '鉛筆', key: 'B' },
  { id: 'eraser', label: '橡皮擦', key: 'E' },
  { id: 'fill', label: '油漆桶', key: 'G' },
  { id: 'eyedropper', label: '滴管', key: 'I' },
  { id: 'line', label: '直線', key: 'L' },
  { id: 'rect', label: '矩形', key: 'U' },
  { id: 'ellipse', label: '橢圓', key: 'Shift+U' },
  { id: 'select', label: '矩形選取', key: 'M' },
  { id: 'lasso', label: '套索選取', key: 'Q' },
  { id: 'move', label: '移動', key: 'V' },
  { id: 'hand', label: '平移畫面', key: 'H' },
];

let stroke = null;
export const isStroking = () => !!stroke;

// ---------- cel helpers ----------
export function setCel(key, buf) {
  if (!buf || isEmpty(buf)) app.doc.cels.delete(key);
  else app.doc.cels.set(key, buf);
}
function editable() {
  const L = activeLayer();
  if (L.locked) { toast('此圖層已鎖定 🔒'); return false; }
  if (!L.visible) { toast('此圖層已隱藏，請先顯示'); return false; }
  return true;
}
// Custom brush: selection mask → list of offsets centred on the stamp point.
export function customBrushFromSelection(sel, maxDim = 64) {
  if (!sel || !sel.mask) return null;
  const { mask, x: sx, y: sy, w, h } = sel;
  const pts = [];
  const gw = sel.gw || W();
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = sx + i, Y = sy + j;
    if (X < 0 || Y < 0 || X >= gw || Y >= H()) continue;
    if (mask[Y * gw + X]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  }
  if (x1 < 0 || x1 - x0 + 1 > maxDim || y1 - y0 + 1 > maxDim) return null;
  const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const X = sx + i, Y = sy + j;
    if (X >= 0 && Y >= 0 && X < gw && Y < H() && mask[Y * gw + X]) pts.push([i - cx, j - cy]);
  }
  return { pts, w: x1 - x0 + 1, h: y1 - y0 + 1, ox: x0 - cx, oy: y0 - cy };
}
function brushOffsets(s = app.ui.brushSize) {
  if (app.ui.brushShape === 'custom' && app.ui.customBrush) return app.ui.customBrush.pts;
  const out = [];
  const lo = -Math.floor((s - 1) / 2);
  const c = (s - 1) / 2;
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      if (app.ui.brushShape === 'circle' && s > 2) {
        const dx = i - c, dy = j - c;
        if (dx * dx + dy * dy > (s / 2) * (s / 2) + 0.2) continue;
      }
      out.push([lo + i, lo + j]);
    }
  return out;
}
// Apple Pencil pressure → brush size (opt-in). Pressure 0..1 maps to 1..brushSize.
// min = dead zone (0..0.5): pressure at or below it stays at size 1 (light palm touches), the rest is rescaled.
export function pressureSizeFor(p, max, min = 0) { const lo = Math.min(0.9, Math.max(0, min || 0)); const n = Math.min(1, Math.max(0, (p - lo) / (1 - lo))); return Math.max(1, Math.round(1 + (max - 1) * n)); }
function pressureSize(st, info) {
  if (!st.pr || !(info.pressure > 0)) return;
  const s = pressureSizeFor(info.pressure, app.ui.brushSize, app.ui.pressureMin);
  if (s !== st.sz) { st.sz = s; st.offs = brushOffsets(s); }
}
function symPoints(x, y) {
  const pts = [[x, y]];
  if (app.ui.symX) pts.push([W() - 1 - x, y]);
  if (app.ui.symY) pts.push([x, H() - 1 - y]);
  if (app.ui.symX && app.ui.symY) pts.push([W() - 1 - x, H() - 1 - y]);
  return pts;
}
function plot(st, x, y) {
  const w = W(), h = H();
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const p = y * w + x;
  if (st.painted[p]) return;
  if (app.selection && !app.selection.mask[p]) return;
  if (st.dither && !ditherHit(st.dither, x, y)) return;
  st.painted[p] = 1;
  if (st.alock) return;
  if (st.shade) {
    const cur = getPixel(st.buf, w, h, x, y);
    if (!cur || cur[3] === 0) return;
    const nc = shadeStep(cur, st.shade);
    setPixel(st.buf, w, h, x, y, nc, 'replace');
    return;
  }
  if (st.lock) {
    const cur = getPixel(st.buf, w, h, x, y);
    if (!cur || cur[3] === 0) return;
    setPixel(st.buf, w, h, x, y, [st.color[0], st.color[1], st.color[2], cur[3]], 'replace');
    return;
  }
  if (st.behind) { const cur = getPixel(st.buf, w, h, x, y); if (cur && cur[3] > 0) return; }
  setPixel(st.buf, w, h, x, y, st.color, st.erase || st.color[3] === 255 ? 'replace' : 'over');
}
function stamp(st, x, y, useBrush = true) {
  const offs = useBrush ? st.offs : [[0, 0]];
  for (const [dx, dy] of offs) for (const [sx, sy] of symPoints(x + dx, y + dy)) plot(st, sx, sy);
}

// ---------- composite sampling ----------
export function compositeFrame(fi, { useOverrides = true } = {}) {
  const m = app.doc.meta;
  const f = m.frames[fi];
  return compositeLayers(m.layers.map((L) => ({
    visible: L.visible, opacity: L.opacity, blend: L.blend,
    buf: useOverrides ? getCelBuf(L.id, fi) : app.doc.cels.get(celKey(L.id, f.id)),
  })), m.width, m.height);
}

// ---------- pointer entry points ----------
export function down(pt, info) {
  const x = Math.floor(pt.x), y = Math.floor(pt.y);
  let tool = app.ui.tool;
  if (info.alt && ['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse'].includes(tool)) tool = 'eyedropper';
  if (info.ctrl && ['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse', 'eyedropper', 'select', 'lasso'].includes(tool) && !app.floating) tool = 'move';
  if (app.ui.oneShot && ['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse'].includes(tool)) { tool = app.ui.oneShot; stroke = null; app.__oneShotUsed = true; }
  const secondary = info.button === 2;
  let color = secondary ? app.ui.secondary : app.ui.primary;
  if (app.ui.paletteLock && color[3] > 0) color = nearestPaletteColor(color, app.doc.meta.palette);
  switch (tool) {
    case 'pencil': case 'eraser': {
      if (!editable()) return;
      const key = activeKey();
      const orig = app.doc.cels.get(key) || createBuffer(W(), H());
      const erase = tool === 'eraser';
      stroke = { tool, key, orig, buf: orig.slice(), color: erase ? [0, 0, 0, 0] : color, erase, shade: !erase && (app.ui.shadeInk === 'dark' || app.ui.shadeInk === 'light') ? (app.ui.shadeInk === 'dark' ? -1 : 1) : 0, lock: !erase && (app.ui.shadeInk === 'recolor' || !!activeLayer().alphaLock), alock: erase && !!activeLayer().alphaLock, behind: !erase && app.ui.shadeInk === 'behind', dither: app.ui.dither, painted: new Uint8Array(W() * H()), path: [[x, y]], offs: brushOffsets(), pp: app.ui.pixelPerfect && app.ui.brushSize === 1, pr: !!app.ui.pressure && info.pointerType === 'pen' };
      pressureSize(stroke, info);
      stamp(stroke, x, y);
      app.overrides.set(key, stroke.buf);
      emit('canvas');
      break;
    }
    case 'line': case 'rect': case 'ellipse': {
      if (!editable()) return;
      const key = activeKey();
      const orig = app.doc.cels.get(key) || createBuffer(W(), H());
      stroke = { tool, key, orig, buf: orig.slice(), color, erase: false, dither: app.ui.dither, painted: new Uint8Array(W() * H()), start: [x, y], offs: brushOffsets() };
      drawShape(stroke, x, y, info.shift);
      break;
    }
    case 'fill': {
      if (!editable()) return;
      const key = activeKey();
      const buf = (app.doc.cels.get(key) || createBuffer(W(), H())).slice();
      const n = floodFill(buf, W(), H(), x, y, color, app.ui.fillContiguous, app.selection?.mask || null);
      if (n) commit('油漆桶', () => setCel(key, buf));
      break;
    }
    case 'eyedropper':
      stroke = { tool: 'eyedropper', secondary };
      pick(x, y, secondary);
      break;
    case 'select': case 'lasso': {
      const fl = app.floating;
      if (fl && insideFloating(x, y) && !info.shift) { stroke = { tool: 'movefloat', sx: x, sy: y, fx: fl.x, fy: fl.y }; break; }
      if (!fl && app.selection && app.selection.mask[y * W() + x] && !info.shift && !info.alt && inBounds(x, y)) {
        if (!editable()) return;
        lift('移動選取');
        stroke = { tool: 'movefloat', sx: x, sy: y, fx: app.floating.x, fy: app.floating.y };
        break;
      }
      dropFloating();
      const mode = info.shift ? 'add' : info.alt ? 'sub' : 'new';
      stroke = { tool, mode, start: [x, y], cur: [x, y], pts: [[pt.x, pt.y]], base: app.selection, moved: false };
      break;
    }
    case 'move': {
      if (app.floating || app.selection) {
        if (!app.floating) { if (!editable()) return; lift('移動選取'); }
        stroke = { tool: 'movefloat', sx: x, sy: y, fx: app.floating.x, fy: app.floating.y };
        break;
      }
      if (!editable()) return;
      const key = activeKey();
      const orig = app.doc.cels.get(key);
      let all = null;
      if (app.ui.linkMove) {
        all = [];
        for (const L of app.doc.meta.layers) {
          if (L.locked || !L.visible) continue;
          const k = celKey(L.id, activeFrame().id), o = app.doc.cels.get(k);
          if (o) all.push({ key: k, orig: o });
        }
        if (!all.length) return;
      } else if (!orig) return;
      stroke = { tool: 'movecel', key, orig, all, sx: x, sy: y, dx: 0, dy: 0 };
      break;
    }
  }
}

function shiftCel(orig, dx, dy) {
  return app.ui.wrapMove ? wrapShift(orig, W(), H(), dx, dy) : reframe(orig, W(), H(), W(), H(), dx, dy);
}

export function move(pt, info) {
  if (!stroke) return;
  const x = Math.floor(pt.x), y = Math.floor(pt.y);
  const st = stroke;
  switch (st.tool) {
    case 'pencil': case 'eraser': {
      pressureSize(st, info);
      const last = st.path[st.path.length - 1];
      if (last[0] === x && last[1] === y) return;
      const pts = linePoints(last[0], last[1], x, y).slice(1);
      let full = false;
      const fresh = [];
      for (const p of pts) {
        st.path.push(p);
        fresh.push(p);
        if (st.pp) {
          const n = st.path.length;
          if (n >= 3) {
            const a = st.path[n - 3], b = st.path[n - 2], c = st.path[n - 1];
            if (Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1 && (b[0] === a[0] || b[1] === a[1]) && (b[0] === c[0] || b[1] === c[1])) {
              st.path.splice(n - 2, 1);
              full = true;
            }
          }
        }
      }
      if (full) {
        st.buf.set(st.orig);
        st.painted.fill(0);
        for (const [px, py] of st.path) stamp(st, px, py);
      } else for (const [px, py] of fresh) stamp(st, px, py);
      emit('canvas');
      break;
    }
    case 'line': case 'rect': case 'ellipse':
      drawShape(st, x, y, info.shift);
      break;
    case 'eyedropper':
      pick(x, y, st.secondary);
      break;
    case 'select': case 'lasso': {
      if (st.tool === 'lasso') st.pts.push([pt.x, pt.y]);
      st.cur = [x, y];
      st.moved = true;
      updateSelPreview(st, false);
      break;
    }
    case 'movefloat': {
      app.floating.x = st.fx + (x - st.sx);
      app.floating.y = st.fy + (y - st.sy);
      refreshFloating();
      break;
    }
    case 'movecel': {
      st.dx = x - st.sx; st.dy = y - st.sy;
      for (const c of st.all || [st]) app.overrides.set(c.key, shiftCel(c.orig, st.dx, st.dy));
      emit('canvas');
      break;
    }
  }
}

export function up(pt, info) {
  if (!stroke) return;
  const st = stroke;
  stroke = null;
  if (app.__oneShotUsed) { app.__oneShotUsed = false; setUI({ oneShot: null }); }
  switch (st.tool) {
    case 'pencil': case 'eraser': case 'line': case 'rect': case 'ellipse': {
      const label = { pencil: '鉛筆', eraser: '橡皮擦', line: '直線', rect: '矩形', ellipse: '橢圓' }[st.tool];
      app.overrides.delete(st.key);
      commit(label, () => setCel(st.key, st.buf));
      break;
    }
    case 'select': case 'lasso':
      if (!st.moved && st.mode === 'new') { app.selection = null; emit('canvas'); emit('selection'); }
      else updateSelPreview(st, true);
      break;
    case 'movecel':
      for (const c of st.all || [st]) app.overrides.delete(c.key);
      if (st.dx || st.dy) commit(st.all ? '連動移動圖層' : '移動圖層內容', () => { for (const c of st.all || [st]) setCel(c.key, shiftCel(c.orig, st.dx, st.dy)); });
      else emit('canvas');
      break;
    case 'eyedropper':
      if (app.ui.prevTool && app.ui.tool === 'eyedropper' && app.ui.tempPick) { setUI({ tool: app.ui.prevTool, tempPick: false }); }
      break;
  }
  emit('strokeEnd');
}

export function cancel() {
  if (!stroke) return;
  const st = stroke;
  stroke = null;
  if (st.key) app.overrides.delete(st.key);
  if (st.all) for (const c of st.all) app.overrides.delete(c.key);
  if (st.tool === 'movefloat' && app.floating) { app.floating.x = st.fx; app.floating.y = st.fy; refreshFloating(); }
  if ((st.tool === 'select' || st.tool === 'lasso')) app.selection = st.base;
  emit('canvas');
  emit('strokeEnd');
}

function drawShape(st, x, y, shift) {
  let [x0, y0] = st.start;
  let x1 = x, y1 = y;
  if (shift) {
    const dx = x1 - x0, dy = y1 - y0;
    if (st.tool === 'line') {
      // Shift 鎖角：0/45/90° 加等角 2:1（≈26.57°）像素線
      const a = Math.atan2(Math.abs(dy), Math.abs(dx));
      const cands = [0, Math.atan(0.5), Math.PI / 4, Math.atan(2), Math.PI / 2];
      const ang = cands.reduce((b, c) => Math.abs(c - a) < Math.abs(b - a) ? c : b);
      const len = Math.max(Math.abs(dx), Math.abs(dy));
      const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
      if (ang === Math.atan(0.5)) { x1 = x0 + sx * len; y1 = y0 + sy * Math.round(len / 2); }
      else if (ang === Math.atan(2)) { y1 = y0 + sy * len; x1 = x0 + sx * Math.round(len / 2); }
      else { x1 = x0 + sx * Math.round(Math.cos(ang) * len); y1 = y0 + sy * Math.round(Math.sin(ang) * len); }
    } else {
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      x1 = x0 + Math.sign(dx || 1) * s; y1 = y0 + Math.sign(dy || 1) * s;
    }
  }
  st.buf.set(st.orig);
  st.painted.fill(0);
  const filled = app.ui.shapeFilled;
  const pts = st.tool === 'line' ? linePoints(x0, y0, x1, y1) : st.tool === 'rect' ? rectPoints(x0, y0, x1, y1, filled) : ellipsePoints(x0, y0, x1, y1, filled);
  const useBrush = !(filled && st.tool !== 'line');
  for (const [px, py] of pts) stamp(st, px, py, useBrush);
  app.overrides.set(st.key, st.buf);
  emit('canvas');
}

function pick(x, y, secondary) {
  if (x < 0 || y < 0 || x >= W() || y >= H()) return;
  let c;
  if (app.ui.sampleLayer) c = getPixel(app.doc.cels.get(activeKey()) || createBuffer(W(), H()), W(), H(), x, y);
  else c = getPixel(compositeFrame(app.ui.frame), W(), H(), x, y);
  if (c[3] === 0) c = [0, 0, 0, 0];
  setUI(secondary ? { secondary: c } : { [app.ui.activeSlot === 'secondary' ? 'secondary' : 'primary']: c });
}

// ---------- selection ----------
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W() && y < H();
export function maskToSel(mask) {
  const w = W(), h = H();
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  return { mask, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function updateSelPreview(st, final) {
  const w = W(), h = H();
  let m;
  if (st.tool === 'select') {
    m = new Uint8Array(w * h);
    const ax = Math.max(0, Math.min(st.start[0], st.cur[0])), bx = Math.min(w - 1, Math.max(st.start[0], st.cur[0]));
    const ay = Math.max(0, Math.min(st.start[1], st.cur[1])), by = Math.min(h - 1, Math.max(st.start[1], st.cur[1]));
    for (let y = ay; y <= by; y++) m.fill(1, y * w + ax, y * w + bx + 1);
  } else m = polygonMask(st.pts, w, h);
  if (st.base && st.mode !== 'new') {
    const b = st.base.mask;
    for (let i = 0; i < m.length; i++) m[i] = st.mode === 'add' ? (m[i] | b[i]) : (b[i] & !m[i]) ? 1 : 0;
  }
  app.selection = maskToSel(m);
  if (st.tool === 'lasso' && !final) app.lassoPreview = st.pts; else app.lassoPreview = null;
  emit('canvas');
  if (final) emit('selection');
}
export function selectAll() {
  dropFloating();
  app.selection = maskToSel(new Uint8Array(W() * H()).fill(1));
  emit('canvas'); emit('selection');
}
export function deselect() {
  dropFloating();
  app.selection = null;
  emit('canvas'); emit('selection');
}
export function invertSelection() {
  dropFloating();
  const m = new Uint8Array(W() * H());
  const old = app.selection?.mask;
  for (let i = 0; i < m.length; i++) m[i] = old && old[i] ? 0 : 1;
  app.selection = maskToSel(m);
  emit('canvas'); emit('selection');
}

// ---------- floating selection ----------
function insideFloating(x, y) {
  const f = app.floating;
  if (!f) return false;
  const lx = x - f.x, ly = y - f.y;
  return lx >= 0 && ly >= 0 && lx < f.w && ly < f.h;
}
export function lift(label = '移動選取') {
  if (app.floating) return app.floating;
  if (!app.selection) selectAllSilently();
  const key = activeKey();
  const cel = app.doc.cels.get(key) || createBuffer(W(), H());
  const { x, y, w, h, mask } = app.selection;
  const buf = createBuffer(w, h), fm = new Uint8Array(w * h);
  const base = cel.slice();
  const Wd = W();
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const p = (y + j) * Wd + (x + i);
      if (!mask[p]) continue;
      fm[j * w + i] = 1;
      buf.set(cel.subarray(p * 4, p * 4 + 4), (j * w + i) * 4);
      base[p * 4] = base[p * 4 + 1] = base[p * 4 + 2] = base[p * 4 + 3] = 0;
    }
  app.floating = { buf, mask: fm, w, h, x, y, base, key, label, origSel: app.selection };
  refreshFloating();
  return app.floating;
}
function selectAllSilently() { app.selection = maskToSel(new Uint8Array(W() * H()).fill(1)); }
export function refreshFloating() {
  const f = app.floating;
  if (!f) return;
  const comp = f.base.slice();
  pasteOver(comp, W(), H(), f.buf, f.w, f.h, f.x, f.y);
  f.composed = comp;
  app.overrides.set(f.key, comp);
  // selection follows floating
  const m = new Uint8Array(W() * H());
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    if (!f.mask[j * f.w + i]) continue;
    const X = f.x + i, Y = f.y + j;
    if (X >= 0 && Y >= 0 && X < W() && Y < H()) m[Y * W() + X] = 1;
  }
  app.selection = { mask: m, x: f.x, y: f.y, w: f.w, h: f.h };
  emit('canvas');
  emit('selection');
}
export function dropFloating() {
  const f = app.floating;
  if (!f) return false;
  app.floating = null;
  app.overrides.delete(f.key);
  commit(f.label, () => setCel(f.key, f.composed));
  app.selection = maskToSel(app.selection?.mask || new Uint8Array(W() * H()));
  emit('selection');
  return true;
}
export function cancelFloating() {
  const f = app.floating;
  if (!f) return;
  app.floating = null;
  app.overrides.delete(f.key);
  app.selection = f.pasted ? null : f.origSel;
  emit('canvas'); emit('selection');
}
export function transformSelection(kind) {
  if (!editable()) return;
  if (!app.floating) lift(kind.startsWith('flip') ? '翻轉' : '旋轉');
  const f = app.floating;
  f.label = { flipH: '水平翻轉', flipV: '垂直翻轉', rotCW: '順時針旋轉 90°', rotCCW: '逆時針旋轉 90°' }[kind];
  const m4 = new Uint8ClampedArray(f.w * f.h * 4);
  for (let i = 0; i < f.mask.length; i++) m4[i * 4 + 3] = f.mask[i] ? 255 : 0;
  if (kind === 'flipH' || kind === 'flipV') {
    f.buf = flipBuffer(f.buf, f.w, f.h, kind === 'flipH');
    const mm = flipBuffer(m4, f.w, f.h, kind === 'flipH');
    f.mask = Uint8Array.from({ length: f.w * f.h }, (_, i) => (mm[i * 4 + 3] ? 1 : 0));
  } else {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const r = rotateBuffer(f.buf, f.w, f.h, kind === 'rotCW');
    const rm = rotateBuffer(m4, f.w, f.h, kind === 'rotCW');
    f.buf = r.buf; f.w = r.w; f.h = r.h;
    f.mask = Uint8Array.from({ length: f.w * f.h }, (_, i) => (rm.buf[i * 4 + 3] ? 1 : 0));
    f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2);
  }
  refreshFloating();
}

export function copySelection() {
  const f = app.floating;
  let clip;
  if (f) clip = { buf: f.buf.slice(), mask: f.mask.slice(), w: f.w, h: f.h, x: f.x, y: f.y };
  else {
    const cel = app.doc.cels.get(activeKey()) || createBuffer(W(), H());
    const sel = app.selection || maskToSel(new Uint8Array(W() * H()).fill(1));
    const buf = createBuffer(sel.w, sel.h), mask = new Uint8Array(sel.w * sel.h);
    for (let j = 0; j < sel.h; j++) for (let i = 0; i < sel.w; i++) {
      const p = (sel.y + j) * W() + sel.x + i;
      if (!sel.mask[p]) continue;
      mask[j * sel.w + i] = 1;
      buf.set(cel.subarray(p * 4, p * 4 + 4), (j * sel.w + i) * 4);
    }
    clip = { buf, mask, w: sel.w, h: sel.h, x: sel.x, y: sel.y };
  }
  app.clipboard = clip;
  toast('已複製');
  emit('clipboard', clip);
  return clip;
}
export function cutSelection() {
  copySelection();
  deleteSelection('剪下');
}
export function pasteClip(clip = app.clipboard, at = null) {
  if (!clip) { toast('剪貼簿是空的'); return; }
  if (!editable()) return;
  dropFloating();
  const key = activeKey();
  const base = (app.doc.cels.get(key) || createBuffer(W(), H())).slice();
  const x = at ? at[0] : Math.max(0, Math.min(clip.x ?? 0, W() - 1));
  const y = at ? at[1] : Math.max(0, Math.min(clip.y ?? 0, H() - 1));
  app.floating = { buf: clip.buf.slice(), mask: (clip.mask || new Uint8Array(clip.w * clip.h).fill(1)).slice(), w: clip.w, h: clip.h, x, y, base, key, label: '貼上', pasted: true };
  if (!['select', 'lasso', 'move'].includes(app.ui.tool)) setUI({ tool: 'move' });
  refreshFloating();
  toast('已貼上，拖曳移動，按 Enter 或「完成」確定');
}
export function deleteSelection(label = '刪除選取內容') {
  if (!editable()) return;
  const f = app.floating;
  if (f) {
    app.floating = null;
    app.overrides.delete(f.key);
    commit(label, () => setCel(f.key, f.base));
    app.selection = null;
    emit('selection');
    return;
  }
  const key = activeKey();
  const cel = app.doc.cels.get(key);
  if (!cel) return;
  if (!app.selection) { commit('清除 cel', () => setCel(key, null)); return; }
  const buf = cel.slice(), m = app.selection.mask;
  for (let i = 0; i < m.length; i++) if (m[i]) buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = buf[i * 4 + 3] = 0;
  commit(label, () => setCel(key, buf));
}

export function clipFromImageData(buf, w, h) {
  return { buf, mask: null, w, h, x: 0, y: 0 };
}

// Used by keyboard: nudge floating selection / cel
export function nudge(dx, dy) {
  if (!app.floating && !app.selection) return false;
  if (!app.floating) { if (!editable()) return true; lift('移動選取'); }
  app.floating.x += dx; app.floating.y += dy;
  refreshFloating();
  return true;
}

export function hexOf(c) { return rgbaToHex(c); }
export { b64ToBytes };
