// Pixel-font text rendering (ADR-0xx): bitmap glyphs are pre-sliced by build tools (work/tools/bdf2slices.py)
// into public/fonts/<fontId>/<page>.json (page = codepoint >> 12), loaded on demand and cached by the Service Worker.
// Glyph record: "advance:rows" where rows = H × 4 hex digits (16-bit, MSB = leftmost pixel).
const L = 'SIL OFL 1.1 · TakWolf/fusion-pixel-font';
const dirs = (id) => ({ zh_tw: id + '-zh_tw', zh_hans: id + '-zh_hans' });
export const FONTS = [
  { id: 'fusion8m', label: 'Fusion Pixel 8px（等寬）', size: 8, style: 'mono', h: 8, dirs: dirs('fusion8m'), license: L },
  { id: 'fusion10m', label: 'Fusion Pixel 10px（等寬）', size: 10, style: 'mono', h: 10, dirs: dirs('fusion10m'), license: L },
  { id: 'fusion12m', label: 'Fusion Pixel 12px（等寬）', size: 12, style: 'mono', h: 12, dirs: dirs('fusion12m'), license: L },
  { id: 'fusion12p', label: 'Fusion Pixel 12px（比例）', size: 12, style: 'prop', h: 16, dirs: dirs('fusion12p'), license: L },
];
export const SIZES = [8, 10, 12];
export const STYLES = [{ id: 'mono', label: '等寬' }, { id: 'prop', label: '比例' }];
// Auto font choice by pixel size: nearest available size, preferring the requested style when the size offers it.
export function pickFont(size = 12, style = 'mono') {
  const sz = SIZES.reduce((b, s) => (Math.abs(s - size) < Math.abs(b - size) ? s : b), SIZES[0]);
  return (FONTS.find((f) => f.size === sz && f.style === style) || FONTS.find((f) => f.size === sz)).id;
}
export function fontInfo(id) { return FONTS.find((x) => x.id === id) || FONTS[2]; }
export const LANGS = [{ id: 'zh_tw', label: '繁體中文 / English' }, { id: 'zh_hans', label: '简体中文 / English' }];
const cache = new Map(); // "dir/page" -> Promise|object
let base = new URL('../../fonts/', import.meta.url).href;
export function setFontBase(u) { base = u; }
export function fontDir(fontId, lang) { const f = fontInfo(fontId); return f.dirs[lang] || Object.values(f.dirs)[0]; }
export function loadPage(dir, page) {
  const k = dir + '/' + page;
  if (!cache.has(k)) {
    const p = fetch(base + dir + '/' + page.toString(16) + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { cache.set(k, j || { g: {}, h: 12, a: 10 }); return cache.get(k); });
    cache.set(k, p);
  }
  return cache.get(k);
}
export async function ensureText(text, fontId, lang) {
  const dir = fontDir(fontId, lang);
  const pages = new Set();
  for (const ch of text) pages.add(ch.codePointAt(0) >> 12);
  await Promise.all([...pages].map((p) => loadPage(dir, p)));
}
export function glyphOf(dir, cp) {
  const pg = cache.get(dir + '/' + (cp >> 12));
  if (!pg || typeof pg.then === 'function') return null;
  const s = pg.g[cp.toString(16)];
  if (!s) return null;
  const i = s.indexOf(':');
  const adv = +s.slice(0, i), hex = s.slice(i + 1), rows = [];
  for (let y = 0; y < pg.h; y++) rows.push(parseInt(hex.substr(y * 4, 4), 16));
  return { adv, rows, h: pg.h };
}
// Render text to an RGBA buffer. Pages must be loaded (await ensureText). Returns null for empty text.
export function renderText(text, { fontId = 'fusion12m', lang = 'zh_tw', color = [0, 0, 0, 255], scale = 1, spacing = 0, lineGap = 2, align = 'left' } = {}) {
  const dir = fontDir(fontId, lang);
  const lines = String(text).replace(/\r/g, '').split('\n');
  const GH = fontInfo(fontId).h;
  const laid = lines.map((ln) => {
    const gs = [];
    let w = 0;
    for (const ch of ln) {
      const cp = ch.codePointAt(0);
      const g = glyphOf(dir, cp) || glyphOf(dir, 0xfffd) || { adv: ch.charCodeAt(0) < 256 ? GH >> 1 : GH, rows: new Array(GH).fill(0) };
      gs.push({ g, x: w });
      w += g.adv + spacing;
    }
    return { gs, w: Math.max(0, w - spacing) };
  });
  const bw = Math.max(0, ...laid.map((l) => l.w));
  const lineH = GH + lineGap;
  const bh = lines.length * lineH - lineGap;
  if (!bw || !lines.some((l) => l.length)) return null;
  const W = bw * scale, H = bh * scale;
  const buf = new Uint8ClampedArray(W * H * 4);
  laid.forEach((l, li) => {
    const ox = align === 'center' ? Math.floor((bw - l.w) / 2) : align === 'right' ? bw - l.w : 0;
    for (const { g, x } of l.gs) {
      for (let y = 0; y < GH; y++) {
        const r = g.rows[y] || 0;
        if (!r) continue;
        for (let i = 0; i < 16; i++) {
          if (!(r >> (15 - i) & 1)) continue;
          const px = (ox + x + i) * scale, py = (li * lineH + y) * scale;
          for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const X = px + dx, Y = py + dy;
            if (X < 0 || X >= W) continue;
            const o = (Y * W + X) * 4;
            buf[o] = color[0]; buf[o + 1] = color[1]; buf[o + 2] = color[2]; buf[o + 3] = color[3];
          }
        }
      }
    }
  });
  return { buf, w: W, h: H };
}
