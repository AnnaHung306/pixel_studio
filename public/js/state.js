// Application state, document model and undo/redo history.
// Invariant: a buffer stored in doc.cels is IMMUTABLE. Tools always copy before editing,
// so history snapshots can share buffers cheaply.
import { celKey, newProjectMeta, uid, hexToRgba, createBuffer } from './core/raster.js';
import { DEFAULT_PALETTE } from './core/palettes.js';

const listeners = new Map();
export function on(ev, fn) { (listeners.get(ev) || listeners.set(ev, new Set()).get(ev)).add(fn); return () => listeners.get(ev).delete(fn); }
export function emit(ev, data) { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch (e) { console.error(e); } } }

export const app = {
  doc: null, // { meta, cels: Map<key, Uint8ClampedArray>, refs: Map<id, dataUrl>, cloud: bool }
  version: 0, // bumps on every doc change (for render caches)
  ui: {
    layerId: null, frame: 0, tool: 'pencil', prevTool: null,
    primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], activeSlot: 'primary',
    brushSize: 1, brushShape: 'square', pixelPerfect: false, dither: '', fillContiguous: true, shapeFilled: false,
    symX: false, symY: false, sampleLayer: false,
    zoom: 8, panX: 0, panY: 0, showGrid: true,
    customGrid: { on: false, w: 8, h: 8, color: '#5b8cff' },
    onion: { on: false, prev: 1, next: 1, opacity: 0.4, tint: true, prevColor: '#ff3030', nextColor: '#3080ff' },
    refsAbove: true, penOnly: false, playing: false, loopMode: 'loop', playTag: '', speed: 1,
    frameSel: null, // [from,to] multi-frame selection for tags
  },
  selection: null, // { mask: Uint8Array, x, y, w, h }
  floating: null, // { buf, mask, w, h, x, y, base, key, label }
  clipboard: null,
  history: { undo: [], redo: [], max: 120 },
  overrides: new Map(), // key -> working buffer during a stroke
  busy: false,
};

export const W = () => app.doc.meta.width;
export const H = () => app.doc.meta.height;

export function newDoc(opts = {}) {
  const meta = newProjectMeta({ name: opts.name || '未命名', width: opts.width || 32, height: opts.height || 32, palette: (opts.palette || DEFAULT_PALETTE).slice() });
  return { meta, cels: new Map(), refs: new Map(), cloud: false };
}

export function setDoc(doc, { keepHistory = false } = {}) {
  app.doc = doc;
  app.selection = null; app.floating = null; app.overrides.clear();
  if (!keepHistory) { app.history.undo = []; app.history.redo = []; }
  const m = doc.meta;
  if (!m.layers.find((l) => l.id === app.ui.layerId)) app.ui.layerId = m.layers[m.layers.length - 1].id;
  app.ui.frame = Math.min(app.ui.frame, m.frames.length - 1);
  if (!keepHistory) app.ui.frame = 0;
  if (m.palette?.length && !keepHistory) {
    app.ui.primary = hexToRgba(m.palette[0]);
    app.ui.secondary = hexToRgba(m.palette[m.palette.length > 1 ? m.palette.length - 1 : 0]);
  }
  app.version++;
  emit('doc'); emit('canvas'); emit('history'); emit('ui');
}

export function layerIndex(id = app.ui.layerId) { return app.doc.meta.layers.findIndex((l) => l.id === id); }
export function activeLayer() { return app.doc.meta.layers.find((l) => l.id === app.ui.layerId) || app.doc.meta.layers[0]; }
export function activeFrame() { return app.doc.meta.frames[app.ui.frame]; }
export function activeKey() { return celKey(activeLayer().id, activeFrame().id); }
export function getCelBuf(layerId, frameIdx) {
  const f = app.doc.meta.frames[frameIdx];
  if (!f) return null;
  const k = celKey(layerId, f.id);
  return app.overrides.get(k) || app.doc.cels.get(k) || null;
}
export function activeCelCopy() {
  const b = app.doc.cels.get(activeKey());
  return b ? b.slice() : createBuffer(W(), H());
}

// ---------- history ----------
function snapshot() {
  return { meta: JSON.parse(JSON.stringify(app.doc.meta)), cels: new Map(app.doc.cels), refs: new Map(app.doc.refs), ui: { layerId: app.ui.layerId, frame: app.ui.frame } };
}
function restore(s) {
  app.doc.meta = JSON.parse(JSON.stringify(s.meta));
  app.doc.cels = new Map(s.cels);
  app.doc.refs = new Map(s.refs);
  const m = app.doc.meta;
  if (m.layers.find((l) => l.id === s.ui.layerId)) app.ui.layerId = s.ui.layerId;
  else if (!m.layers.find((l) => l.id === app.ui.layerId)) app.ui.layerId = m.layers[m.layers.length - 1].id;
  app.ui.frame = Math.max(0, Math.min(s.ui.frame, m.frames.length - 1));
}

// Run `fn` (which mutates app.doc) as one undoable step.
export function commit(label, fn, { kind = 'local', silent = false } = {}) {
  const before = snapshot();
  const res = fn();
  const after = snapshot();
  app.history.undo.push({ label, kind, before, after, time: Date.now() });
  if (app.history.undo.length > app.history.max) app.history.undo.shift();
  app.history.redo = [];
  changed({ structural: true, origin: kind, silent });
  return res;
}

export function changed({ structural = true, origin = 'local', silent = false } = {}) {
  app.version++;
  app.doc.meta.updatedAt = Date.now();
  if (structural) emit('doc');
  emit('canvas');
  emit('history');
  if (!silent) emit('dirty', { origin });
}

export function undo() {
  const e = app.history.undo.pop();
  if (!e) return false;
  restore(e.before);
  app.history.redo.push(e);
  app.selection = null;
  changed({ origin: 'undo' });
  emit('toast', `復原：${e.label}`);
  return true;
}
export function redo() {
  const e = app.history.redo.pop();
  if (!e) return false;
  restore(e.after);
  app.history.undo.push(e);
  changed({ origin: 'redo' });
  emit('toast', `重做：${e.label}`);
  return true;
}
export function jumpHistory(undoLen) {
  while (app.history.undo.length > undoLen && app.history.undo.length) { const e = app.history.undo.pop(); restore(e.before); app.history.redo.push(e); }
  while (app.history.undo.length < undoLen && app.history.redo.length) { const e = app.history.redo.pop(); restore(e.after); app.history.undo.push(e); }
  changed({ origin: 'undo' });
}

export function setUI(patch) {
  Object.assign(app.ui, patch);
  emit('ui', patch);
  emit('canvas');
}

export function toast(msg, cls = '') { emit('toast', { msg, cls }); }
export { uid, celKey };
