// Vector → pixel glyph converter (ADR-009). Pure functions: a rasterizer callback supplies 8-bit coverage
// (alpha) for a glyph drawn at a sub-pixel offset; this module turns it into a clean 1-bit bitmap.
// Pipeline: sub-pixel offset search (pick the crispest alignment) → threshold → stroke keeping
// (thin strokes that fall between thresholds are kept as 1px) → speckle removal.
export const DEFAULTS = { threshold: 128, keep: 64, despeckle: true, align: true };
const OFFS = [0, 0.25, 0.5, 0.75];

// Crispness: how far coverage values sit from the undecided middle. Higher = better aligned to the pixel grid.
export function crispness(a) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - 128); return s; }

// Threshold coverage → bits (Uint8Array 0/1), w×h.
export function binarize(a, w, h, o = {}) {
  const { threshold, keep, despeckle } = { ...DEFAULTS, ...o };
  const b = new Uint8Array(w * h);
  for (let i = 0; i < b.length; i++) b[i] = a[i] >= threshold ? 1 : 0;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x]);
  const B = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : b[y * w + x]);
  if (keep > 0 && keep < threshold) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = A(x, y);
      if (b[y * w + x] || v < keep) continue;
      // keep a faint pixel when it is a ridge (local max) along an axis and has no solid neighbour on that axis:
      // that is a thin stroke that would otherwise break.
      const hz = v >= A(x - 1, y) && v >= A(x + 1, y) && !B(x - 1, y) && !B(x + 1, y);
      const vt = v >= A(x, y - 1) && v >= A(x, y + 1) && !B(x, y - 1) && !B(x, y + 1);
      const joins = B(x - 1, y) || B(x + 1, y) || B(x, y - 1) || B(x, y + 1) || B(x - 1, y - 1) || B(x + 1, y - 1) || B(x - 1, y + 1) || B(x + 1, y + 1);
      if ((hz || vt) && joins) add.push(y * w + x);
    }
    for (const i of add) b[i] = 1;
  }
  if (despeckle) {
    const rm = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!b[y * w + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && B(x + dx, y + dy)) n++;
      if (!n && a[y * w + x] < 230) rm.push(y * w + x);
    }
    for (const i of rm) b[i] = 0;
  }
  return b;
}

// render(ox, oy) → Uint8 coverage w×h with glyph shifted by (ox, oy) pixels. Returns { bits, w, h, dx, dy }.
export function convertGlyph(render, w, h, o = {}) {
  const op = { ...DEFAULTS, ...o };
  let best = null;
  const list = op.align ? OFFS.flatMap((ox) => OFFS.map((oy) => [ox, oy])) : [[0, 0]];
  for (const [ox, oy] of list) {
    const a = render(ox, oy);
    const c = crispness(a) - (ox + oy) * 8; // tiny bias toward no shift
    if (!best || c > best.c) best = { c, a, ox, oy };
  }
  return { bits: binarize(best.a, w, h, op), w, h, dx: best.ox, dy: best.oy };
}

export function bitsToRows(bits, w, h) { // → 16-bit rows (MSB = leftmost), like pixelfont records; w ≤ 16
  const rows = [];
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < Math.min(w, 16); x++) if (bits[y * w + x]) r |= 1 << (15 - x); rows.push(r); }
  return rows;
}
export function inkCount(bits) { let n = 0; for (const v of bits) n += v; return n; }

// ---- browser rasterizer (canvas) ----
export const CONV_FAMILY = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif';
export function canvasRender(ch, size, { family = CONV_FAMILY, weight = 400 } = {}) {
  const w = size, h = size;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  return (ox, oy) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#000'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `${weight} ${size * 0.92}px ${family}`;
    g.fillText(ch, ox, size * 0.84 + oy);
    const d = g.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  };
}
export function convertChar(ch, size, o = {}) {
  const r = convertGlyph(canvasRender(ch, size, o), size, size, o);
  r.cp = ch.codePointAt(0);
  return r;
}
