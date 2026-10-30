// Pixel-font text rendering (ADR-0xx): bitmap glyphs are pre-sliced by build tools (work/tools/bdf2slices.py)
// into public/fonts/<fontId>/<page>.json (page = codepoint >> 12), loaded on demand and cached by the Service Worker.
// Glyph record: "advance:rows" where rows = H × 4 hex digits (16-bit, MSB = leftmost pixel).
import { dictGlyph } from './glyphdict.js';
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
    if (page > 0xf) cache.set(k, { g: {}, h: 12, a: 10 }); // BMP only: pages above U+FFFF are not shipped
    else { const p = fetch(base + dir + '/' + page.toString(16) + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { cache.set(k, j || { g: {}, h: 12, a: 10 }); return cache.get(k); });
    cache.set(k, p); }
  }
  return cache.get(k);
}
// Converter fallback (B61): glyphs missing from the bitmap font are generated from a vector font at the font's pixel height.
// fallback(ch, px) → { rows:[16-bit], adv } | null. Results are cached per (px, codepoint) and flagged auto.
let fallback = null;
const fbCache = new Map();
export function setFallback(fn) { fallback = fn; fbCache.clear(); }
export function fallbackGlyph(cp, px) { return fbCache.get(px + ':' + cp) || null; }
export const isBlank = (ch) => /^[\s\u0000-\u001f\u007f\u200b-\u200f]$/u.test(ch);
export async function ensureText(text, fontId, lang) {
  const dir = fontDir(fontId, lang);
  const pages = new Set();
  for (const ch of text) pages.add(ch.codePointAt(0) >> 12);
  await Promise.all([...pages].map((p) => loadPage(dir, p)));
  if (fallback) {
    const px = fontInfo(fontId).size;
    for (const ch of new Set(text)) {
      const cp = ch.codePointAt(0);
      if (isBlank(ch) || glyphOf(dir, cp) || fbCache.has(px + ':' + cp)) continue;
      const r = fallback(ch, px);
      if (r) fbCache.set(px + ':' + cp, { ...r, h: px, auto: true });
    }
  }
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
export function renderText(text, { fontId = 'fusion12m', lang = 'zh_tw', color = [0, 0, 0, 255], scale = 1, spacing = 0, lineGap = 2, align = 'left', effect = 'none', effColor = [0, 0, 0, 255], vertical = false } = {}) {
  const r0 = vertical ? renderVertical(text, { fontId, lang, color, scale, spacing, lineGap }) : renderTextBase(text, { fontId, lang, color, scale, spacing, lineGap, align });
  return r0 && effect !== 'none' ? applyTextEffect(r0, effect, effColor, scale) : r0;
}
// Outline (1 text-pixel ring, 8-neighbour) or drop shadow (+1,+1). Grows the bitmap by one text-pixel.
export function applyTextEffect(r, effect, ec, scale = 1) {
  const pad = scale, W = r.w + pad * 2, H = r.h + pad * 2, buf = new Uint8ClampedArray(W * H * 4);
  const on = (x, y) => x >= 0 && y >= 0 && x < r.w && y < r.h && r.buf[(y * r.w + x) * 4 + 3] > 0;
  const put = (x, y, c) => { const o = (y * W + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = c[3]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - pad, sy = y - pad;
    if (on(sx, sy)) continue;
    let hit = false;
    if (effect === 'outline') { for (let dy = -scale; dy <= scale && !hit; dy += scale) for (let dx = -scale; dx <= scale; dx += scale) if ((dx || dy) && on(sx + dx, sy + dy)) { hit = true; break; } }
    else hit = on(sx - scale, sy - scale);
    if (hit) put(x, y, ec);
  }
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (on(x, y)) { const o = (y * r.w + x) * 4; put(x + pad, y + pad, [r.buf[o], r.buf[o + 1], r.buf[o + 2], r.buf[o + 3]]); }
  return { buf, w: W, h: H };
}
function renderTextBase(text, { fontId, lang, color, scale, spacing, lineGap, align }) {
  const dir = fontDir(fontId, lang);
  const lines = String(text).replace(/\r/g, '').split('\n');
  const GH = fontInfo(fontId).h, GH_SIZE = fontInfo(fontId).size;
  const laid = lines.map((ln) => {
    const gs = [];
    let w = 0;
    for (const ch of ln) {
      const cp = ch.codePointAt(0);
      const g = dictGlyph(cp, GH_SIZE) || glyphOf(dir, cp) || fallbackGlyph(cp, fontInfo(fontId).size) || glyphOf(dir, 0xfffd) || { adv: ch.charCodeAt(0) < 256 ? GH >> 1 : GH, rows: new Array(GH).fill(0) };
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

// Vertical (直排): each line becomes a column, glyphs stacked top→bottom, columns run right→left.
function renderVertical(text, { fontId, lang, color, scale, spacing, lineGap }) {
  const dir = fontDir(fontId, lang), info = fontInfo(fontId), GH = info.h, SZ = info.size;
  const cols = String(text).replace(/\r/g, '').split('\n').map((ln) => [...ln]);
  if (!cols.some((c) => c.length)) return null;
  const cw = GH + lineGap, nRows = Math.max(...cols.map((c) => c.length));
  const W = (cols.length * cw - lineGap) * scale, H = (nRows * (GH + spacing) - spacing) * scale;
  if (W <= 0 || H <= 0) return null;
  const buf = new Uint8ClampedArray(W * H * 4);
  cols.forEach((col, ci) => {
    const colX = (cols.length - 1 - ci) * cw;
    col.forEach((ch, ri) => {
      const cp = ch.codePointAt(0);
      const g = dictGlyph(cp, SZ) || glyphOf(dir, cp) || fallbackGlyph(cp, SZ) || glyphOf(dir, 0xfffd) || { adv: cp < 256 ? GH >> 1 : GH, rows: new Array(GH).fill(0) };
      const ox = colX + ((GH - g.adv) >> 1);
      for (let y = 0; y < GH; y++) {
        const r = g.rows[y] || 0;
        if (!r) continue;
        for (let i = 0; i < 16; i++) {
          if (!(r >> (15 - i) & 1)) continue;
          const px = (ox + i) * scale, py = (ri * (GH + spacing) + y) * scale;
          for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const X = px + dx, Y = py + dy;
            if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
            const o = (Y * W + X) * 4;
            buf[o] = color[0]; buf[o + 1] = color[1]; buf[o + 2] = color[2]; buf[o + 3] = color[3];
          }
        }
      }
    });
  });
  return { buf, w: W, h: H };
}
