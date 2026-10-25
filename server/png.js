import { PNG } from 'pngjs';
import { compositeLayers, createBuffer, scaleNearest, celKey } from '../public/js/core/raster.js';

export function encodePNG(buf, w, h) {
  const png = new PNG({ width: w, height: h, colorType: 6 });
  png.data = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  return PNG.sync.write(png, { colorType: 6 });
}

export function decodePNG(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { w: png.width, h: png.height, buf: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength).slice() };
}

export function decodeDataUrlOrB64(s) {
  const b64 = String(s).replace(/^data:[^,]*,/, '');
  return Buffer.from(b64, 'base64');
}

export function frameIndexToId(p, idx) { return p.meta.frames[idx]?.id; }

// Composite a frame (optionally a single layer) of project p
export function renderFrame(p, frameIdx, { layerId = null, ignoreVisibility = false } = {}) {
  const { width: w, height: h } = p.meta;
  const frame = p.meta.frames[frameIdx];
  if (!frame) throw new Error('frame not found');
  const layers = p.meta.layers
    .filter((L) => (layerId ? L.id === layerId : true))
    .map((L) => ({
      visible: layerId || ignoreVisibility ? true : L.visible,
      opacity: layerId ? 1 : L.opacity,
      blend: layerId ? 'normal' : L.blend,
      buf: p.cels.get(celKey(L.id, frame.id)),
    }));
  return compositeLayers(layers, w, h);
}

export function renderFramePNG(p, frameIdx, opts = {}) {
  const { width: w, height: h } = p.meta;
  const s = Math.max(1, Math.min(20, opts.scale | 0 || 1));
  const buf = scaleNearest(renderFrame(p, frameIdx, opts), w, h, s);
  return encodePNG(buf, w * s, h * s);
}

export function renderSheetPNG(p, opts = {}) {
  const { width: w, height: h } = p.meta;
  const n = p.meta.frames.length;
  const s = Math.max(1, Math.min(20, opts.scale | 0 || 1));
  const cols = Math.max(1, Math.min(n, opts.columns | 0 || n));
  const rows = Math.ceil(n / cols);
  const W = w * cols, H = h * rows;
  const sheet = createBuffer(W, H);
  for (let i = 0; i < n; i++) {
    const f = renderFrame(p, i);
    const ox = (i % cols) * w, oy = Math.floor(i / cols) * h;
    for (let y = 0; y < h; y++) sheet.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * W + ox) * 4);
  }
  return { png: encodePNG(scaleNearest(sheet, W, H, s), W * s, H * s), cols, rows };
}
