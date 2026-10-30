// Document-level actions: layers, frames, tags, canvas size, palette.
import { app, commit, emit, setUI, activeLayer, activeKey, layerIndex, W, H, toast, uid, celKey } from './state.js';
import { dropFloating, setCel } from './tools.js';
import { nearestPaletteColor } from './core/palettes.js';
import { reframe, compositeLayers, blendInto, createBuffer, rgbaToHex } from './core/raster.js';

export function selectFrame(i) {
  dropFloating();
  const n = app.doc.meta.frames.length;
  setUI({ frame: ((i % n) + n) % n });
  emit('doc');
}
export function selectLayer(id) {
  dropFloating();
  setUI({ layerId: id });
  emit('doc');
}

// ---------- layers ----------
export function addLayer() {
  dropFloating();
  commit('新增圖層', () => {
    const m = app.doc.meta;
    const L = { id: uid('L'), name: `圖層 ${m.layers.length + 1}`, visible: true, locked: false, opacity: 1, blend: 'normal' };
    m.layers.splice(layerIndex() + 1, 0, L);
    app.ui.layerId = L.id;
  });
}
export function duplicateLayer() {
  dropFloating();
  commit('複製圖層', () => {
    const m = app.doc.meta;
    const src = activeLayer();
    const L = { ...src, id: uid('L'), name: src.name + ' 複本', locked: false };
    m.layers.splice(layerIndex() + 1, 0, L);
    for (const f of m.frames) { const b = app.doc.cels.get(celKey(src.id, f.id)); if (b) app.doc.cels.set(celKey(L.id, f.id), b); }
    app.ui.layerId = L.id;
  });
}
export function deleteLayer() {
  const m = app.doc.meta;
  if (m.layers.length <= 1) return toast('至少要保留一個圖層');
  dropFloating();
  commit('刪除圖層', () => {
    const i = layerIndex();
    const [L] = m.layers.splice(i, 1);
    for (const f of m.frames) app.doc.cels.delete(celKey(L.id, f.id));
    app.ui.layerId = m.layers[Math.max(0, i - 1)].id;
  });
}
export function mergeDown() {
  const m = app.doc.meta;
  const i = layerIndex();
  if (i <= 0) return toast('下方沒有圖層可合併');
  dropFloating();
  commit('向下合併', () => {
    const top = m.layers[i], below = m.layers[i - 1];
    for (const f of m.frames) {
      const tb = app.doc.cels.get(celKey(top.id, f.id));
      if (!tb || !top.visible) continue;
      const bb = (app.doc.cels.get(celKey(below.id, f.id)) || createBuffer(W(), H())).slice();
      blendInto(bb, tb, top.opacity, top.blend);
      app.doc.cels.set(celKey(below.id, f.id), bb);
    }
    for (const f of m.frames) app.doc.cels.delete(celKey(top.id, f.id));
    m.layers.splice(i, 1);
    app.ui.layerId = below.id;
  });
}
export function moveLayer(id, toIndex) {
  const m = app.doc.meta;
  const from = m.layers.findIndex((l) => l.id === id);
  if (from < 0 || toIndex === from) return;
  commit('調整圖層順序', () => {
    const [L] = m.layers.splice(from, 1);
    m.layers.splice(Math.max(0, Math.min(m.layers.length, toIndex)), 0, L);
  });
}
export function updateLayer(id, patch, label = '圖層屬性') {
  commit(label, () => Object.assign(app.doc.meta.layers.find((l) => l.id === id), patch));
}

// ---------- frames ----------
function shiftTags(at, delta) {
  for (const t of app.doc.meta.tags) {
    if (delta > 0) { if (t.from >= at) t.from += delta; if (t.to >= at) t.to += delta; }
    else { if (t.from > at) t.from--; if (t.to >= at) t.to--; }
  }
  app.doc.meta.tags = app.doc.meta.tags.filter((t) => t.to >= t.from && t.to >= 0);
}
export function addFrame(copy = false) {
  dropFloating();
  commit(copy ? '複製影格' : '新增影格', () => {
    const m = app.doc.meta;
    const cur = m.frames[app.ui.frame];
    const F = { id: uid('F'), duration: cur.duration };
    const at = app.ui.frame + 1;
    m.frames.splice(at, 0, F);
    shiftTags(at, 1);
    if (copy) for (const L of m.layers) { const b = app.doc.cels.get(celKey(L.id, cur.id)); if (b) app.doc.cels.set(celKey(L.id, F.id), b); }
    app.ui.frame = at;
  });
}
export function deleteFrame() {
  const m = app.doc.meta;
  if (m.frames.length <= 1) return toast('至少要保留一個影格');
  dropFloating();
  commit('刪除影格', () => {
    const i = app.ui.frame;
    const [F] = m.frames.splice(i, 1);
    for (const L of m.layers) app.doc.cels.delete(celKey(L.id, F.id));
    shiftTags(i, -1);
    app.ui.frame = Math.min(i, m.frames.length - 1);
  });
}
export function moveFrame(delta) {
  const m = app.doc.meta;
  const i = app.ui.frame, j = i + delta;
  if (j < 0 || j >= m.frames.length) return;
  dropFloating();
  commit('移動影格', () => {
    [m.frames[i], m.frames[j]] = [m.frames[j], m.frames[i]];
    app.ui.frame = j;
  });
}
export function setFrameDuration(idxs, ms) {
  ms = Math.max(10, Math.min(65535, Math.round(ms)));
  commit('影格時長', () => { for (const i of idxs) app.doc.meta.frames[i].duration = ms; });
}
export function clearCel() {
  dropFloating();
  const k = celKey(activeLayer().id, app.doc.meta.frames[app.ui.frame].id);
  if (!app.doc.cels.has(k)) return;
  commit('清除 cel', () => app.doc.cels.delete(k));
}

// ---------- tags ----------
export function saveTag(tag) {
  commit(tag.id ? '編輯標籤' : '新增標籤', () => {
    const tags = app.doc.meta.tags;
    if (tag.id) Object.assign(tags.find((t) => t.id === tag.id), tag);
    else tags.push({ ...tag, id: uid('T') });
  });
}
export function deleteTag(id) {
  commit('刪除標籤', () => { app.doc.meta.tags = app.doc.meta.tags.filter((t) => t.id !== id); });
}

// ---------- canvas ----------
export function resizeCanvas(nw, nh, ax = 0.5, ay = 0.5) {
  dropFloating();
  const ow = W(), oh = H();
  const ox = Math.round((nw - ow) * ax), oy = Math.round((nh - oh) * ay);
  commit('畫布大小', () => {
    for (const [k, b] of app.doc.cels) app.doc.cels.set(k, reframe(b, ow, oh, nw, nh, ox, oy));
    for (const k of [...app.doc.cels.keys()]) setCel(k, app.doc.cels.get(k));
    app.doc.meta.width = nw; app.doc.meta.height = nh;
  });
  app.selection = null;
  emit('fit');
}
export function cropToSelection() {
  const s = app.selection;
  if (!s) return toast('請先建立選取範圍');
  dropFloating();
  const ow = W(), oh = H();
  commit('裁切到選取範圍', () => {
    for (const [k, b] of app.doc.cels) app.doc.cels.set(k, reframe(b, ow, oh, s.w, s.h, -s.x, -s.y));
    for (const k of [...app.doc.cels.keys()]) setCel(k, app.doc.cels.get(k));
    app.doc.meta.width = s.w; app.doc.meta.height = s.h;
  });
  app.selection = null;
  emit('fit');
}
export function scaleSprite(factor) {
  // nearest-neighbour scale of all cels (integer factors, or 0.5)
  dropFloating();
  const ow = W(), oh = H();
  const nw = Math.max(1, Math.round(ow * factor)), nh = Math.max(1, Math.round(oh * factor));
  if (nw > 2048 || nh > 2048) return toast('尺寸過大（上限 2048）');
  commit(`縮放 ×${factor}`, () => {
    for (const [k, b] of app.doc.cels) {
      const out = createBuffer(nw, nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const si = (Math.min(oh - 1, Math.floor(y / factor)) * ow + Math.min(ow - 1, Math.floor(x / factor))) * 4;
        out.set(b.subarray(si, si + 4), (y * nw + x) * 4);
      }
      app.doc.cels.set(k, out);
    }
    app.doc.meta.width = nw; app.doc.meta.height = nh;
  });
  emit('fit');
}

// ---------- palette ----------
export function setPalette(colors, label = '調色盤') {
  commit(label, () => { app.doc.meta.palette = colors; });
}
export function addPaletteColor(c) {
  const hex = rgbaToHex(c);
  if (app.doc.meta.palette.includes(hex)) return toast('調色盤已有此顏色');
  setPalette([...app.doc.meta.palette, hex], '新增顏色');
}
export function removePaletteColor(hex) {
  setPalette(app.doc.meta.palette.filter((c) => c !== hex), '移除顏色');
}
// B51: names live in meta.paletteNames {hex: name}; empty name clears.
export function namePaletteColor(hex, name) {
  const nm = String(name || '').trim().slice(0, 40);
  commit(nm ? '命名顏色' : '清除顏色名稱', () => {
    const m = app.doc.meta;
    m.paletteNames = { ...(m.paletteNames || {}) };
    if (nm) m.paletteNames[hex] = nm; else delete m.paletteNames[hex];
  });
}

export function renameProject(name) {
  commit('重新命名', () => { app.doc.meta.name = name; });
}

// ---------- references ----------
export function addReference(name, dataUrl, w, h) {
  commit('新增參考圖', () => {
    const id = uid('R');
    const scale = Math.min(1, W() / w, H() / h) || 1;
    app.doc.meta.references.push({ id, name, opacity: 0.5, visible: true, x: 0, y: 0, scale: +scale.toFixed(4), pixelated: false });
    app.doc.refs.set(id, dataUrl);
  });
}
export function updateReference(id, patch, label = '參考圖') {
  commit(label, () => Object.assign(app.doc.meta.references.find((r) => r.id === id), patch), { silent: false });
}
export function deleteReference(id) {
  commit('刪除參考圖', () => {
    app.doc.meta.references = app.doc.meta.references.filter((r) => r.id !== id);
    app.doc.refs.delete(id);
  });
}

export function compositeAll(fi) {
  const m = app.doc.meta;
  return compositeLayers(m.layers.map((L) => ({ visible: L.visible, opacity: L.opacity, blend: L.blend, buf: app.doc.cels.get(celKey(L.id, m.frames[fi].id)) })), m.width, m.height);
}

// Convert every cel (all layers/frames) to the current palette (iter 27). Returns number of pixels changed.
export function convertToPalette() {
  const pal = app.doc.meta.palette;
  if (!pal || !pal.length) { toast('調色盤是空的'); return 0; }
  dropFloating();
  let changed = 0;
  commit('轉換為調色盤顏色', () => {
    for (const [k, buf] of app.doc.cels) {
      const nb = buf.slice(); const cache = new Map();
      for (let i = 0; i < nb.length; i += 4) {
        if (nb[i + 3] === 0) continue;
        const key = (nb[i] << 16) | (nb[i + 1] << 8) | nb[i + 2];
        let c = cache.get(key);
        if (!c) { c = nearestPaletteColor([nb[i], nb[i + 1], nb[i + 2], 255], pal); cache.set(key, c); }
        if (nb[i] !== c[0] || nb[i + 1] !== c[1] || nb[i + 2] !== c[2]) { nb[i] = c[0]; nb[i + 1] = c[1]; nb[i + 2] = c[2]; changed++; }
      }
      app.doc.cels.set(k, nb);
    }
  });
  toast(changed ? `已轉換 ${changed} 個像素到調色盤` : '所有像素已在調色盤內');
  return changed;
}

// Invert RGB of every opaque pixel in all cels (iter 28). Returns pixels changed.
export function invertColors() {
  dropFloating();
  let changed = 0;
  commit('反相顏色', () => {
    for (const [k, buf] of app.doc.cels) {
      const nb = buf.slice();
      for (let i = 0; i < nb.length; i += 4) {
        if (nb[i + 3] === 0) continue;
        nb[i] = 255 - nb[i]; nb[i + 1] = 255 - nb[i + 1]; nb[i + 2] = 255 - nb[i + 2]; changed++;
      }
      app.doc.cels.set(k, nb);
    }
  });
  toast(changed ? `已反相 ${changed} 個像素` : '沒有可反相的像素');
  return changed;
}

// Map every opaque pixel's RGB through fn (iter 29). Returns pixels changed.
function mapColors(label, fn, doneMsg, noneMsg) {
  dropFloating();
  let changed = 0;
  commit(label, () => {
    for (const [k, buf] of app.doc.cels) {
      const nb = buf.slice();
      for (let i = 0; i < nb.length; i += 4) {
        if (nb[i + 3] === 0) continue;
        const [r, g, b] = fn(nb[i], nb[i + 1], nb[i + 2]);
        if (r !== nb[i] || g !== nb[i + 1] || b !== nb[i + 2]) { nb[i] = r; nb[i + 1] = g; nb[i + 2] = b; changed++; }
      }
      app.doc.cels.set(k, nb);
    }
  });
  toast(changed ? doneMsg(changed) : noneMsg);
  return changed;
}

// Grayscale (Rec.601 luma) of all cels (iter 29).
export function grayscaleColors() {
  return mapColors('灰階', (r, g, b) => { const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b); return [y, y, y]; }, (n) => `已轉為灰階 ${n} 個像素`, '沒有可轉換的像素');
}

// Rotate hue by deg (iter 29).
export function hueShift(deg = 30) {
  return mapColors('色相偏移', (r, g, b) => {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const m = [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return [cl(m[0] * r + m[1] * g + m[2] * b), cl(m[3] * r + m[4] * g + m[5] * b), cl(m[6] * r + m[7] * g + m[8] * b)];
  }, (n) => `已偏移色相 ${deg}°（${n} 個像素）`, '沒有可轉換的像素');
}

// Raise/lower contrast of all cels by pct percent (iter 39): scales distance from mid-gray 128.
export function adjustContrast(pct = 20) {
  const k = 1 + Math.max(-100, Math.min(100, pct)) / 100;
  const f = (v) => Math.max(0, Math.min(255, Math.round((v - 128) * k + 128)));
  const nm = pct >= 0 ? '增加對比' : '降低對比';
  return mapColors(nm, (r, g, b) => [f(r), f(g), f(b)], (n) => `已${nm} ${Math.abs(pct)}%（${n} 個像素）`, '沒有可調整的像素');
}

// Raise/lower saturation by pct percent (iter 40): scales each channel's distance from Rec.601 luma.
export function adjustSaturation(pct = 20) {
  const k = 1 + Math.max(-100, Math.min(100, pct)) / 100;
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const nm = pct >= 0 ? '增加飽和度' : '降低飽和度';
  return mapColors(nm, (r, g, b) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [cl(y + (r - y) * k), cl(y + (g - y) * k), cl(y + (b - y) * k)]; }, (n) => `已${nm} ${Math.abs(pct)}%（${n} 個像素）`, '沒有可調整的像素');
}

// Lighten/darken all cels by pct percent (iter 38): positive blends toward white, negative toward black.
export function adjustBrightness(pct = 15) {
  const t = Math.max(-100, Math.min(100, pct)) / 100;
  const f = (v) => Math.max(0, Math.min(255, Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t))));
  return mapColors(t >= 0 ? '變亮' : '變暗', (r, g, b) => [f(r), f(g), f(b)], (n) => `已${t >= 0 ? '變亮' : '變暗'} ${Math.abs(pct)}%（${n} 個像素）`, '沒有可調整的像素');
}

// Add a 1px outline around opaque pixels of the active cel (iter 35; options iter 36).
// mode: 'outer' (default, transparent pixels next to art) | 'inner' (opaque edge pixels become outline). diag: 8-neighbour.
export function addOutline(opts = {}) {
  const { mode = 'outer', diag = false } = opts;
  dropFloating();
  const key = activeKey();
  const src = app.doc.cels.get(key);
  if (!src) { toast('這個影格的圖層是空的'); return 0; }
  const w = W(), h = H(), nb = src.slice(), c = app.ui.primary;
  const inner = mode === 'inner';
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  if (diag) dirs.push([-1, -1], [1, -1], [-1, 1], [1, 1]);
  let added = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if ((src[i + 3] !== 0) === !inner) continue; // outer: only transparent; inner: only opaque
    let n = false;
    for (const [dx, dy] of dirs) {
      const xx = x + dx, yy = y + dy;
      const op = xx >= 0 && xx < w && yy >= 0 && yy < h ? src[(yy * w + xx) * 4 + 3] !== 0 : false;
      if (inner ? !op : op) { n = true; break; }
    }
    if (n) { nb[i] = c[0]; nb[i + 1] = c[1]; nb[i + 2] = c[2]; nb[i + 3] = 255; added++; }
  }
  if (!added) { toast('沒有可加外框的像素'); return 0; }
  commit(inner ? '加內框' : '加外框', () => { setCel(key, nb); });
  toast(`已加${inner ? '內' : '外'}框 ${added} 個像素`);
  return added;
}
