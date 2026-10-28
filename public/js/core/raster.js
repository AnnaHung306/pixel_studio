// Shared raster core — used by both the browser app and the Node server.
// Buffers are RGBA Uint8ClampedArray (width*height*4). Colors are [r,g,b,a] 0-255.

export function uid(prefix = '') {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues
    ? globalThis.crypto.getRandomValues(a)
    : a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)));
  return prefix + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const celKey = (layerId, frameId) => `${layerId}:${frameId}`;

export function createBuffer(w, h) {
  return new Uint8ClampedArray(w * h * 4);
}

export function hexToRgba(hex) {
  if (Array.isArray(hex)) return hex.slice(0, 4).concat(hex.length < 4 ? [255] : []);
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h === 'transparent') return [0, 0, 0, 0];
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) throw new Error(`無效的顏色: ${hex}`);
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

export function rgbaToHex(c, withAlpha = true) {
  const s = (v) => (v | 0).toString(16).padStart(2, '0');
  return '#' + s(c[0]) + s(c[1]) + s(c[2]) + (withAlpha ? s(c[3]) : '');
}

export function getPixel(buf, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0];
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

// mode: 'replace' writes the color as-is (used for eraser / exact pixel set);
// 'over' composites source-over (alpha colors blend).
export function setPixel(buf, w, h, x, y, c, mode = 'replace') {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const i = (y * w + x) * 4;
  if (mode === 'over' && c[3] < 255) {
    const sa = c[3] / 255, da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) { buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0; return true; }
    for (let k = 0; k < 3; k++) buf[i + k] = (c[k] * sa + buf[i + k] * da * (1 - sa)) / oa;
    buf[i + 3] = oa * 255;
    return true;
  }
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  return true;
}

export function linePoints(x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 100000; guard++) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

export function rectPoints(x0, y0, x1, y1, filled) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const pts = [];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++)
      if (filled || x === ax || x === bx || y === ay || y === by) pts.push([x, y]);
  return pts;
}

export function ellipsePoints(x0, y0, x1, y1, filled) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  const rx = (bx - ax) / 2 + 0.5, ry = (by - ay) / 2 + 0.5;
  const W = bx - ax + 1, H = by - ay + 1;
  const inside = new Uint8Array(W * H);
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1.0001) inside[(y - ay) * W + (x - ax)] = 1;
    }
  // guarantee extremities for thin ellipses
  const pts = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : inside[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      if (filled || !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) pts.push([x + ax, y + ay]);
    }
  if (!pts.length) pts.push([Math.round(cx), Math.round(cy)]);
  return pts;
}

export function sameColor(buf, i, c, tol = 0) {
  if (tol === 0) {
    if (buf[i + 3] === 0 && c[3] === 0) return true;
    return buf[i] === c[0] && buf[i + 1] === c[1] && buf[i + 2] === c[2] && buf[i + 3] === c[3];
  }
  return Math.abs(buf[i] - c[0]) <= tol && Math.abs(buf[i + 1] - c[1]) <= tol &&
    Math.abs(buf[i + 2] - c[2]) <= tol && Math.abs(buf[i + 3] - c[3]) <= tol;
}

// Flood fill. Returns number of pixels changed. `mask` (optional Uint8Array) restricts the fill area.
export function floodFill(buf, w, h, x, y, color, contiguous = true, mask = null, tol = 0) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  if (mask && !mask[y * w + x]) return 0;
  const target = getPixel(buf, w, h, x, y);
  const si = (y * w + x) * 4;
  if (sameColor(buf, si, color, 0)) return 0;
  let count = 0;
  const ok = (p) => (!mask || mask[p]) && sameColor(buf, p * 4, target, tol);
  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (ok(p)) { buf.set(color, p * 4); count++; }
    return count;
  }
  const seen = new Uint8Array(w * h);
  const stack = [y * w + x];
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!ok(p)) continue;
    buf.set(color, p * 4); count++;
    const px = p % w, py = (p - px) / w;
    if (px > 0) stack.push(p - 1);
    if (px < w - 1) stack.push(p + 1);
    if (py > 0) stack.push(p - w);
    if (py < h - 1) stack.push(p + w);
  }
  return count;
}

export function isEmpty(buf) {
  if (!buf) return true;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 0) return false;
  return true;
}

// Composite layers. layers: [{visible, opacity(0..1), blend:'normal'|'multiply'|'screen', buf}] bottom → top.
export function compositeLayers(layers, w, h, out = null) {
  out = out || createBuffer(w, h);
  out.fill(0);
  for (const L of layers) {
    if (!L || !L.buf || L.visible === false) continue;
    blendInto(out, L.buf, L.opacity ?? 1, L.blend || 'normal');
  }
  return out;
}

export function blendInto(dst, src, opacity = 1, blend = 'normal') {
  const n = dst.length;
  for (let i = 0; i < n; i += 4) {
    const sa0 = src[i + 3];
    if (sa0 === 0) continue;
    const as = (sa0 / 255) * opacity;
    const ab = dst[i + 3] / 255;
    if (ab === 0 || (as >= 1 && blend === 'normal')) {
      dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = as * 255;
      continue;
    }
    const ao = as + ab * (1 - as);
    for (let k = 0; k < 3; k++) {
      const Cs = src[i + k] / 255, Cb = dst[i + k] / 255;
      let B = Cs;
      if (blend === 'multiply') B = Cs * Cb;
      else if (blend === 'screen') B = Cs + Cb - Cs * Cb;
      else if (blend === 'overlay') B = Cb <= 0.5 ? 2 * Cs * Cb : 1 - 2 * (1 - Cs) * (1 - Cb);
      const co = as * (1 - ab) * Cs + as * ab * B + (1 - as) * ab * Cb;
      dst[i + k] = (co / ao) * 255;
    }
    dst[i + 3] = ao * 255;
  }
  return dst;
}

// Copy src (sw×sh) into a new w×h buffer with offset (ox, oy). Used for canvas resize / crop.
export function reframe(src, sw, sh, w, h, ox = 0, oy = 0) {
  const out = createBuffer(w, h);
  for (let y = 0; y < sh; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < sw; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= w) continue;
      const si = (y * sw + x) * 4, di = (ty * w + tx) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return out;
}

// Source-over paste of src (sw×sh) onto dst (w×h) at (ox,oy).
export function pasteOver(dst, w, h, src, sw, sh, ox, oy) {
  let changed = 0;
  for (let y = 0; y < sh; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < sw; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= w) continue;
      const si = (y * sw + x) * 4;
      if (src[si + 3] === 0) continue;
      setPixel(dst, w, h, tx, ty, [src[si], src[si + 1], src[si + 2], src[si + 3]], 'over');
      changed++;
    }
  }
  return changed;
}

export function flipBuffer(buf, w, h, horizontal) {
  const out = createBuffer(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? w - 1 - x : x, sy = horizontal ? y : h - 1 - y;
      const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
      out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = buf[si + 3];
    }
  return out;
}

// Rotate 90° clockwise (cw=true) or counter-clockwise. Returns {buf, w, h}.
export function rotateBuffer(buf, w, h, cw = true) {
  const out = createBuffer(h, w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = cw ? h - 1 - y : y, ny = cw ? x : w - 1 - x;
      const si = (y * w + x) * 4, di = (ny * h + nx) * 4;
      out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = buf[si + 3];
    }
  return { buf: out, w: h, h: w };
}

export function scaleNearest(buf, w, h, s) {
  if (s === 1) return buf;
  const W = w * s, H = h * s, out = createBuffer(W, H);
  for (let y = 0; y < H; y++) {
    const sy = (y / s) | 0;
    for (let x = 0; x < W; x++) {
      const si = (sy * w + ((x / s) | 0)) * 4, di = (y * W + x) * 4;
      out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = buf[si + 3];
    }
  }
  return out;
}

// Ordered dither patterns: returns true when (x,y) should be painted.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function ditherHit(pattern, x, y) {
  if (!pattern) return true;
  const t = BAYER4[(y & 3) * 4 + (x & 3)];
  switch (pattern) {
    case 'checker': return ((x + y) & 1) === 0;
    case '25': return t < 4;
    case '75': return t < 12;
    case '12': return t < 2;
    case 'hlines': return (y & 1) === 0;
    case 'vlines': return (x & 1) === 0;
    default: return true;
  }
}

// Point-in-polygon mask for lasso.
export function polygonMask(points, w, h) {
  const mask = new Uint8Array(w * h);
  if (points.length < 3) return mask;
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) mask[y * w + x] = 1;
    }
  }
  // include the outline pixels themselves
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
    for (const [x, y] of linePoints(Math.floor(x0), Math.floor(y0), Math.floor(x1), Math.floor(y1)))
      if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
  }
  return mask;
}

// ---- base64 (works in browser and Node) ----
export function bytesToB64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export function b64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(b64, 'base64');
    return new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength).slice();
  }
  const s = atob(b64);
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay'];

export function newProjectMeta({ name = '未命名', width = 32, height = 32, palette } = {}) {
  const layerId = uid('L');
  const frameId = uid('F');
  return {
    id: uid('P'),
    name,
    width,
    height,
    palette: palette || [],
    layers: [{ id: layerId, name: '圖層 1', visible: true, locked: false, opacity: 1, blend: 'normal' }],
    frames: [{ id: frameId, duration: 100 }],
    tags: [],
    references: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// B40：匯出倍率防護。iPadOS Safari 的 canvas 上限約 16,777,216 像素（4096×4096），舊機型更低；超過會得到空白圖或記憶體不足。
export const MAX_EXPORT_PIXELS = 16777216;
export function limitScale(scale, w, h, maxPixels = MAX_EXPORT_PIXELS) {
  scale = Math.max(1, scale | 0);
  while (scale > 1 && w * scale * h * scale > maxPixels) scale--;
  return scale;
}
