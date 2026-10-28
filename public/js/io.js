// Export (PNG, scaled PNG, sprite sheet + JSON, GIF, APNG, ZIP of frames, .pxs) and import (PNG/GIF/JPG/.pxs).
import { app, W, H, commit, uid, celKey, toast } from './state.js';
import { compositeAll } from './actions.js';
import { scaleNearest, createBuffer, reframe, isEmpty } from './core/raster.js';
import { encodeGIF, encodeAPNG, encodePNG, makeZip, decodeGIF, sheetGeometry } from './formats.js';
import { download, readAs, isIOS } from './dom.js';
import { docToJSON, docFromJSON } from './storage.js';
import { dropFloating } from './tools.js';
import { APP_VERSION } from './version.js';

const safeName = () => (app.doc.meta.name || 'pixel').replace(/[\\/:*?"<>|]+/g, '_');

export function frameIndices(range) {
  const n = app.doc.meta.frames.length;
  if (range === 'current') return [app.ui.frame];
  const t = app.doc.meta.tags.find((x) => x.id === range);
  if (t) {
    const arr = [];
    for (let i = t.from; i <= Math.min(t.to, n - 1); i++) arr.push(i);
    return t.direction === 'reverse' ? arr.reverse() : arr;
  }
  return Array.from({ length: n }, (_, i) => i);
}

async function bufToPngBlob(buf, w, h) {
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (b) return b;
  } catch {}
  return encodePNG(buf, w, h);
}
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

export async function exportPNG(scale = 1, fi = app.ui.frame) {
  dropFloating();
  const buf = scaleNearest(compositeAll(fi), W(), H(), scale);
  download(await bufToPngBlob(buf, W() * scale, H() * scale), `${safeName()}${app.doc.meta.frames.length > 1 ? '-' + (fi + 1) : ''}${scale > 1 ? '@' + scale + 'x' : ''}.png`);
}

export async function exportFramesZip(scale, idxs) {
  dropFloating();
  const files = [];
  for (const [n, i] of idxs.entries()) {
    const buf = scaleNearest(compositeAll(i), W(), H(), scale);
    files.push({ name: `${safeName()}_${String(n).padStart(3, '0')}.png`, data: await bytes(await bufToPngBlob(buf, W() * scale, H() * scale)) });
  }
  download(makeZip(files), `${safeName()}-frames.zip`);
}

export async function exportSheet(scale, idxs, { layout = 'horizontal', columns = 8, zip = false, pad = 0 } = {}) {
  dropFloating();
  const n = idxs.length, w = W(), h = H();
  const geo = sheetGeometry(n, w, h, layout, columns, pad);
  const SW = geo.width, SH = geo.height;
  const sheet = createBuffer(SW, SH);
  const framesJson = {};
  idxs.forEach((fi, k) => {
    const f = compositeAll(fi);
    const ox = geo.cells[k].x, oy = geo.cells[k].y;
    for (let y = 0; y < h; y++) sheet.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * SW + ox) * 4);
    framesJson[`${safeName()} ${k}.png`] = {
      frame: { x: ox * scale, y: oy * scale, w: w * scale, h: h * scale }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: w * scale, h: h * scale }, sourceSize: { w: w * scale, h: h * scale },
      duration: app.doc.meta.frames[fi].duration,
    };
  });
  const imgName = `${safeName()}-sheet.png`;
  const json = {
    frames: framesJson,
    meta: {
      app: 'Pixel Studio', version: APP_VERSION, image: imgName, format: 'RGBA8888',
      size: { w: SW * scale, h: SH * scale }, scale: String(scale), padding: geo.pad,
      frameTags: app.doc.meta.tags.map((t) => ({ name: t.name, from: Math.max(0, idxs.indexOf(t.from)), to: Math.max(0, idxs.indexOf(t.to)), direction: t.direction, color: t.color })),
      layers: app.doc.meta.layers.map((l) => ({ name: l.name, opacity: Math.round(l.opacity * 255), blendMode: l.blend })),
      slices: [],
    },
  };
  const png = await bufToPngBlob(scaleNearest(sheet, SW, SH, scale), SW * scale, SH * scale);
  const jsonBlob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  // iOS Safari only allows one download per tap, so the PNG + JSON pair is always delivered as one ZIP there.
  if (zip || isIOS) download(makeZip([{ name: imgName, data: await bytes(png) }, { name: `${safeName()}-sheet.json`, data: await bytes(jsonBlob) }]), `${safeName()}-sheet.zip`);
  else {
    download(png, imgName);
    setTimeout(() => download(jsonBlob, `${safeName()}-sheet.json`), 400);
  }
}

function animSequence(idxs, loopMode) {
  if (loopMode === 'pingpong' && idxs.length > 2) return [...idxs, ...idxs.slice(1, -1).reverse()];
  return idxs;
}
export async function exportGIF(scale, idxs, loopMode = 'loop') {
  dropFloating();
  const seq = animSequence(idxs, loopMode);
  const frames = seq.map((fi) => ({ buf: scaleNearest(compositeAll(fi), W(), H(), scale), duration: app.doc.meta.frames[fi].duration }));
  download(encodeGIF(frames, W() * scale, H() * scale, loopMode === 'once' ? 1 : 0), `${safeName()}${scale > 1 ? '@' + scale + 'x' : ''}.gif`);
}
export async function exportAPNG(scale, idxs, loopMode = 'loop') {
  dropFloating();
  const seq = animSequence(idxs, loopMode);
  const frames = seq.map((fi) => ({ buf: scaleNearest(compositeAll(fi), W(), H(), scale), duration: app.doc.meta.frames[fi].duration }));
  download(await encodeAPNG(frames, W() * scale, H() * scale, loopMode === 'once' ? 1 : 0), `${safeName()}${scale > 1 ? '@' + scale + 'x' : ''}.apng.png`);
}
export function exportPxs() {
  dropFloating();
  download(new Blob([JSON.stringify(docToJSON(app.doc))], { type: 'application/json' }), `${safeName()}.pxs`);
  import('./notices.js').then((n) => n.markBackup()).catch(() => {});
}

// ---------- import ----------
export async function decodeImageFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gif') || file.type === 'image/gif') {
    const g = decodeGIF(new Uint8Array(await readAs(file, 'buffer')));
    return { w: g.width, h: g.height, frames: g.frames };
  }
  const url = await readAs(file, 'dataurl');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('無法讀取圖片')); i.src = url; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, frames: [{ buf: new Uint8ClampedArray(data), duration: 100 }], dataUrl: url };
}

export async function readPxs(file) {
  return docFromJSON(JSON.parse(await readAs(file, 'text')));
}

export function docFromImage(img, name) {
  const lid = uid('L');
  const frames = img.frames.map((f) => ({ id: uid('F'), duration: Math.max(10, f.duration || 100) }));
  const cels = new Map();
  img.frames.forEach((f, i) => { if (!isEmpty(f.buf)) cels.set(celKey(lid, frames[i].id), f.buf); });
  // build palette from unique colors (up to 64)
  const set = new Set();
  for (const f of img.frames) { for (let i = 0; i < f.buf.length && set.size <= 64; i += 4) if (f.buf[i + 3]) set.add('#' + [f.buf[i], f.buf[i + 1], f.buf[i + 2], 255].map((v) => v.toString(16).padStart(2, '0')).join('')); }
  return {
    meta: { id: uid('P'), name: name.replace(/\.[^.]+$/, ''), width: img.w, height: img.h, palette: set.size <= 64 ? [...set] : [], layers: [{ id: lid, name: '圖層 1', visible: true, locked: false, opacity: 1, blend: 'normal' }], frames, tags: [], references: [], createdAt: Date.now(), updatedAt: Date.now() },
    cels, refs: new Map(), cloud: false,
  };
}

// Insert decoded image into current doc as a new layer (frames mapped from current frame onwards)
export function importAsLayer(img, name) {
  dropFloating();
  commit('匯入圖片為圖層', () => {
    const m = app.doc.meta;
    const L = { id: uid('L'), name: name.replace(/\.[^.]+$/, '').slice(0, 30) || '匯入', visible: true, locked: false, opacity: 1, blend: 'normal' };
    m.layers.push(L);
    img.frames.forEach((f, k) => {
      let fi = app.ui.frame + k;
      if (fi >= m.frames.length) m.frames.push({ id: uid('F'), duration: f.duration || 100 });
      const buf = reframe(f.buf, img.w, img.h, m.width, m.height, 0, 0);
      if (!isEmpty(buf)) app.doc.cels.set(celKey(L.id, m.frames[fi].id), buf);
    });
    app.ui.layerId = L.id;
  });
  if (img.w > W() || img.h > H()) toast(`圖片 ${img.w}×${img.h} 大於畫布，已裁切`);
}
