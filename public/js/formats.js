// File formats: GIF encode/decode, PNG/APNG encode, ZIP (store) writer. No dependencies.

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- ZIP (stored, no compression) ----------
export function makeZip(files) { // files: [{name, data: Uint8Array}]
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- PNG / APNG encoder (uses CompressionStream 'deflate' = zlib) ----------
async function zlib(data) {
  if (typeof CompressionStream === 'undefined') return zlibStore(data);
  const cs = new CompressionStream('deflate');
  const out = new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(await out);
}
function zlibStore(data) { // fallback: zlib with stored blocks
  const blocks = Math.ceil(data.length / 65535) || 1;
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const s = data.subarray(i * 65535, (i + 1) * 65535);
    out[o++] = i === blocks - 1 ? 1 : 0; out[o++] = s.length & 255; out[o++] = s.length >> 8; out[o++] = ~s.length & 255; out[o++] = (~s.length >> 8) & 255;
    out.set(s, o); o += s.length;
  }
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; b = (b + a) % 65521; }
  out[o++] = b >> 8; out[o++] = b & 255; out[o++] = a >> 8; out[o++] = a & 255;
  return out;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const u32 = (...vals) => { const b = new Uint8Array(vals.length * 4); const dv = new DataView(b.buffer); vals.forEach((v, i) => dv.setUint32(i * 4, v)); return b; };
function rawScanlines(buf, w, h) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(buf.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  return raw;
}
const SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function ihdr(w, h) { const b = new Uint8Array(13); new DataView(b.buffer).setUint32(0, w); new DataView(b.buffer).setUint32(4, h); b[8] = 8; b[9] = 6; return chunk('IHDR', b); }

export async function encodePNG(buf, w, h) {
  const idat = await zlib(rawScanlines(buf, w, h));
  return new Blob([SIG, ihdr(w, h), chunk('IDAT', idat), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}

// frames: [{buf, duration}], all w×h. loops: 0 = infinite
export async function encodeAPNG(frames, w, h, loops = 0) {
  const parts = [SIG, ihdr(w, h), chunk('acTL', u32(frames.length, loops))];
  let seq = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const fc = new Uint8Array(26);
    const dv = new DataView(fc.buffer);
    dv.setUint32(0, seq++); dv.setUint32(4, w); dv.setUint32(8, h); dv.setUint32(12, 0); dv.setUint32(16, 0);
    dv.setUint16(20, Math.min(65535, Math.round(f.duration))); dv.setUint16(22, 1000);
    fc[24] = 0; /* dispose none */ fc[25] = 0; /* blend source */
    parts.push(chunk('fcTL', fc));
    const data = await zlib(rawScanlines(f.buf, w, h));
    if (i === 0) parts.push(chunk('IDAT', data));
    else { const fd = new Uint8Array(4 + data.length); new DataView(fd.buffer).setUint32(0, seq++); fd.set(data, 4); parts.push(chunk('fdAT', fd)); }
  }
  parts.push(chunk('IEND', new Uint8Array()));
  return new Blob(parts, { type: 'image/png' });
}

// ---------- GIF encoder ----------
// frames: [{buf(RGBA), duration}] ; transparency via index 0 when alpha < 128
export function encodeGIF(frames, w, h, loops = 0) {
  // Build global palette from all opaque colors
  const counts = new Map();
  for (const f of frames) for (let i = 0; i < f.buf.length; i += 4) {
    if (f.buf[i + 3] < 128) continue;
    const k = (f.buf[i] << 16) | (f.buf[i + 1] << 8) | f.buf[i + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let colors = [...counts.keys()];
  if (colors.length > 255) colors = medianCut([...counts.entries()], 255);
  const palette = [0, ...colors]; // index 0 = transparent
  let bits = 1; while ((1 << bits) < palette.length) bits++;
  const size = 1 << bits;
  const lookup = new Map();
  const exact = counts.size <= 255;
  if (exact) colors.forEach((c, i) => lookup.set(c, i + 1));
  const nearest = (k) => {
    let v = lookup.get(k);
    if (v !== undefined) return v;
    const r = k >> 16, g = (k >> 8) & 255, b = k & 255;
    let best = 1, bd = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i], dr = (c >> 16) - r, dg = ((c >> 8) & 255) - g, db = (c & 255) - b;
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) { bd = d; best = i + 1; }
    }
    lookup.set(k, best);
    return best;
  };
  const out = [];
  const push = (...b) => out.push(...b);
  const str = (s) => [...s].forEach((c) => out.push(c.charCodeAt(0)));
  str('GIF89a');
  push(w & 255, w >> 8, h & 255, h >> 8, 0xf0 | (bits - 1), 0, 0);
  for (let i = 0; i < size; i++) { const c = palette[i] || 0; push((c >> 16) & 255, (c >> 8) & 255, c & 255); }
  if (frames.length > 1) { push(0x21, 0xff, 0x0b); str('NETSCAPE2.0'); push(0x03, 0x01, loops & 255, loops >> 8, 0x00); }
  for (const f of frames) {
    const delay = Math.max(2, Math.round(f.duration / 10));
    push(0x21, 0xf9, 0x04, (2 << 2) | 1, delay & 255, delay >> 8, 0, 0); // dispose=2 (restore bg), transparent idx 0
    push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0);
    const idx = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < idx.length; p++, i += 4) idx[p] = f.buf[i + 3] < 128 ? 0 : nearest((f.buf[i] << 16) | (f.buf[i + 1] << 8) | f.buf[i + 2]);
    const minCode = Math.max(2, bits);
    push(minCode);
    const data = lzwEncode(idx, minCode);
    for (let i = 0; i < data.length; i += 255) { const s = data.subarray(i, i + 255); push(s.length); for (const b of s) out.push(b); }
    push(0);
  }
  push(0x3b);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

function lzwEncode(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  const out = [];
  let cur = 0, curBits = 0;
  let codeSize = minCode + 1;
  const emit = (code) => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 255); cur >>>= 8; curBits -= 8; }
  };
  let dict = new Map();
  let next = eoi + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const v = dict.get(key);
    if (v !== undefined) { prefix = v; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map(); next = eoi + 1; codeSize = minCode + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) out.push(cur & 255);
  return new Uint8Array(out);
}

function medianCut(entries, n) {
  let boxes = [entries.map(([k, c]) => [k >> 16, (k >> 8) & 255, k & 255, c])];
  while (boxes.length < n) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.shift();
    if (box.length < 2) { boxes.push(box); break; }
    let ch = 0, best = -1;
    for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of box) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); } if (hi - lo > best) { best = hi - lo; ch = c; } }
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, t = 0;
    for (const p of b) { r += p[0] * p[3]; g += p[1] * p[3]; bl += p[2] * p[3]; t += p[3]; }
    return (Math.round(r / t) << 16) | (Math.round(g / t) << 8) | Math.round(bl / t);
  });
}

// ---------- GIF decoder ----------
// returns { width, height, frames: [{buf, duration}] } fully composited frames
export function decodeGIF(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (!sig.startsWith('GIF')) throw new Error('不是 GIF 檔案');
  p = 6;
  const W = b[p] | (b[p + 1] << 8), H = b[p + 2] | (b[p + 3] << 8);
  const flags = b[p + 4]; p += 7;
  let gct = null;
  if (flags & 0x80) { const n = 2 << (flags & 7); gct = b.subarray(p, p + n * 3); p += n * 3; }
  const canvas = new Uint8ClampedArray(W * H * 4);
  const frames = [];
  let gce = { delay: 100, transparent: -1, dispose: 0 };
  while (p < b.length) {
    const block = b[p++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = b[p++];
      if (label === 0xf9) {
        const pf = b[p + 1];
        gce = { dispose: (pf >> 2) & 7, delay: (b[p + 2] | (b[p + 3] << 8)) * 10 || 100, transparent: pf & 1 ? b[p + 4] : -1 };
      }
      while (b[p] !== 0) p += b[p] + 1;
      p++;
    } else if (block === 0x2c) {
      const ix = b[p] | (b[p + 1] << 8), iy = b[p + 2] | (b[p + 3] << 8), iw = b[p + 4] | (b[p + 5] << 8), ih = b[p + 6] | (b[p + 7] << 8);
      const f = b[p + 8]; p += 9;
      let ct = gct;
      if (f & 0x80) { const n = 2 << (f & 7); ct = b.subarray(p, p + n * 3); p += n * 3; }
      const interlaced = !!(f & 0x40);
      const minCode = b[p++];
      const data = [];
      while (b[p] !== 0) { const n = b[p++]; for (let i = 0; i < n; i++) data.push(b[p + i]); p += n; }
      p++;
      const idx = lzwDecode(new Uint8Array(data), minCode, iw * ih);
      const backup = gce.dispose === 3 ? canvas.slice() : null;
      const rows = interlaced ? interlaceRows(ih) : null;
      for (let j = 0; j < ih; j++) {
        const y = iy + (rows ? rows[j] : j);
        if (y >= H) continue;
        for (let i = 0; i < iw; i++) {
          const x = ix + i;
          if (x >= W) continue;
          const c = idx[j * iw + i];
          if (c === gce.transparent || !ct || c * 3 >= ct.length) continue;
          const o = (y * W + x) * 4;
          canvas[o] = ct[c * 3]; canvas[o + 1] = ct[c * 3 + 1]; canvas[o + 2] = ct[c * 3 + 2]; canvas[o + 3] = 255;
        }
      }
      frames.push({ buf: canvas.slice(), duration: gce.delay });
      if (gce.dispose === 2) for (let j = iy; j < Math.min(H, iy + ih); j++) canvas.fill(0, (j * W + ix) * 4, (j * W + Math.min(W, ix + iw)) * 4);
      else if (gce.dispose === 3 && backup) canvas.set(backup);
      gce = { delay: 100, transparent: -1, dispose: 0 };
    } else break;
  }
  return { width: W, height: H, frames };
}
function interlaceRows(h) {
  const rows = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}
function lzwDecode(data, minCode, npix) {
  const out = new Uint8Array(npix);
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, next = eoi + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  let old = -1, first = 0, o = 0, bits = 0, cur = 0, pos = 0;
  while (o < npix) {
    while (bits < codeSize) { if (pos >= data.length) return out; cur |= data[pos++] << bits; bits += 8; }
    let code = cur & ((1 << codeSize) - 1);
    cur >>= codeSize; bits -= codeSize;
    if (code === clear) { codeSize = minCode + 1; next = eoi + 1; old = -1; continue; }
    if (code === eoi) break;
    if (old === -1) { out[o++] = suffix[code]; old = code; first = code; continue; }
    const inCode = code;
    let sp = 0;
    if (code >= next) { stack[sp++] = first; code = old; }
    while (code >= clear) { stack[sp++] = suffix[code]; code = prefix[code]; }
    first = suffix[code];
    stack[sp++] = first;
    while (sp && o < npix) out[o++] = stack[--sp];
    if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if (next >= (1 << codeSize) && codeSize < 12) codeSize++; }
    old = inCode;
  }
  return out;
}

// Sprite-sheet geometry (pure). pad = transparent gap in source pixels between frames and around the sheet edge.
export function sheetGeometry(n, w, h, layout = 'horizontal', columns = 8, pad = 0) {
  pad = Math.max(0, Math.min(64, pad | 0));
  const cols = layout === 'horizontal' ? n : layout === 'vertical' ? 1 : Math.max(1, Math.min(n, columns | 0 || 1));
  const rows = Math.ceil(n / cols);
  const cells = Array.from({ length: n }, (_, k) => ({ x: pad + (k % cols) * (w + pad), y: pad + Math.floor(k / cols) * (h + pad) }));
  return { cols, rows, pad, width: cols * w + (cols + 1) * pad, height: rows * h + (rows + 1) * pad, cells };
}
