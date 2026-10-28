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
    brushSize: 1, pressure: false, pressureMin: 0, brushShape: 'square', pixelPerfect: false, dither: '', shadeInk: '', paletteLock: false, fillContiguous: true, fillGradient: false, shapeFilled: false,
    linkMove: false, wrapMove: false, symX: false, symY: false, longPressMs: 600, tapGestures: true, sampleLayer: false,
    zoom: 8, panX: 0, panY: 0, showGrid: true, tilePreview: false,
    customGrid: { on: false, w: 8, h: 8, color: '#5b8cff' },
    onion: { on: false, prev: 1, next: 1, opacity: 0.4, tint: true, prevColor: '#ff3030', nextColor: '#3080ff' },
    refsAbove: true, penOnly: false, leftHand: false, playing: false, loopMode: 'loop', playTag: '', speed: 1,
    frameSel: null, // [from,to] multi-frame selection for tags
  },
  selection: null, // { mask: Uint8Array, x, y, w, h }
  floating: null, // { buf, mask, w, h, x, y, base, key, label }
  clipboard: null,
  history: { undo: [], redo: [], max: 200, minKeep: 10, budget: 0, trimmed: 0, warned: false },
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
  if (!keepHistory) { app.history.undo = []; app.history.redo = []; app.history.trimmed = 0; app.history.warned = false; }
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

// ---------- history memory budget (ADR-003) ----------
// iPadOS Safari reloads a tab that uses too much memory (= lost work), so history is bounded by bytes, not only steps.
// Each entry records the bytes only it keeps alive: buffers in `before` not in `after` (old versions an undo needs)
// and the reverse (new versions a redo needs). Live buffers belong to the document and are not counted.
export function defaultHistoryBudget(nav = globalThis.navigator) {
  const MB = 1048576;
  const ua = nav?.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1);
  if (ios) return 96 * MB;
  if (nav?.deviceMemory && nav.deviceMemory <= 4) return 128 * MB;
  return 320 * MB;
}
app.history.budget = defaultHistoryBudget();
const metaBytes = (m) => JSON.stringify(m).length * 2;
export function entryCost(before, after) {
  let bOnly = 0, aOnly = 0;
  for (const [k, b] of before.cels) if (after.cels.get(k) !== b) bOnly += b.byteLength;
  for (const [k, b] of after.cels) if (before.cels.get(k) !== b) aOnly += b.byteLength;
  for (const [k, v] of before.refs) if (after.refs.get(k) !== v) bOnly += v.length * 2;
  for (const [k, v] of after.refs) if (before.refs.get(k) !== v) aOnly += v.length * 2;
  const mb = metaBytes(before.meta) + metaBytes(after.meta);
  return { bOnly: bOnly + mb, aOnly: aOnly + mb };
}
const costOf = (e) => e.cost || (e.cost = entryCost(e.before, e.after));
// Bytes retained only by history (undo keeps old versions, redo keeps newer versions).
export function historyBytes(h = app.history) {
  let n = 0;
  for (const e of h.undo) n += costOf(e).bOnly;
  for (const e of h.redo) n += costOf(e).aOnly;
  return n;
}
// Drop oldest undo steps while over the step or byte budget (always keep the newest `minKeep`).
export function enforceHistoryBudget(h = app.history) {
  let removed = 0;
  while (h.undo.length > h.max) { h.undo.shift(); removed++; }
  let bytes = historyBytes(h), byBudget = 0;
  while (bytes > h.budget && h.undo.length > h.minKeep) { bytes -= costOf(h.undo.shift()).bOnly; byBudget++; }
  removed += byBudget;
  h.trimmed += removed;
  if (byBudget && !h.warned) { h.warned = true; emit('toast', { msg: '復原記憶體已達上限，已自動移除最舊的步驟（作品不受影響）', cls: 'warn' }); }
  return removed;
}
// Push an undoable entry (used by local commits and remote/AI writes).
export function pushHistory(entry) {
  entry.cost = entryCost(entry.before, entry.after);
  app.history.undo.push(entry);
  app.history.redo = [];
  enforceHistoryBudget();
}

// Run `fn` (which mutates app.doc) as one undoable step.
export function commit(label, fn, { kind = 'local', silent = false } = {}) {
  const before = snapshot();
  const res = fn();
  const after = snapshot();
  pushHistory({ label, kind, before, after, time: Date.now() });
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
