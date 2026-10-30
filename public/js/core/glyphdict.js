// User glyph dictionary (ADR-010): global, per (pixel height, codepoint). Lookup order when typing:
// user dictionary → built-in bitmap font → converter fallback. Persisted via an injectable backend (IndexedDB in the browser).
// Record: { px, cp, ch, rows:[16-bit × px], adv, src:'convert'|'draw'|'selection'|'edit', t }
const dict = new Map();
let backend = null;
const k = (px, cp) => px + ':' + cp;
export const MAX_W = 16;
export function setBackend(b) { backend = b; }
export async function loadDict() {
  dict.clear();
  if (!backend) return 0;
  for (const r of await backend.all()) dict.set(k(r.px, r.cp), r);
  return dict.size;
}
export function dictGlyph(cp, px) { const r = dict.get(k(px, cp)); return r ? { adv: r.adv, rows: r.rows, h: px, user: true } : null; }
export function hasGlyph(cp, px) { return dict.has(k(px, cp)); }
export function listGlyphs({ px = 0, q = '' } = {}) {
  return [...dict.values()].filter((r) => (!px || r.px === px) && (!q || q.includes(r.ch) || r.ch.includes(q))).sort((a, b) => a.px - b.px || a.cp - b.cp);
}
export function dictSize() { return dict.size; }
// rows: array of 16-bit ints; adv defaults to the ink width (≥ px/2).
export async function saveGlyph({ ch, px, rows, adv, src = 'draw' }) {
  const cp = String(ch).codePointAt(0);
  if (!cp || !Number.isInteger(px) || px < 4 || px > 32) throw new Error('bad glyph');
  const r = { px, cp, ch: String.fromCodePoint(cp), rows: Array.from({ length: px }, (_, i) => (rows[i] || 0) & 0xffff), adv: adv ?? Math.max(px >> 1, Math.min(MAX_W, px)), src, t: Date.now() };
  dict.set(k(px, cp), r);
  if (backend) await backend.put(r);
  return r;
}
export async function deleteGlyph(px, cp) { dict.delete(k(px, cp)); if (backend) await backend.del(k(px, cp)); }
export function exportDict() { return JSON.stringify({ app: 'pixel-studio-glyphs', v: 1, glyphs: [...dict.values()].map(({ px, cp, rows, adv, src }) => ({ px, cp, adv, src, rows: rows.map((n) => n.toString(16).padStart(4, '0')).join('') })) }); }
// Merge; returns number imported. Invalid records are skipped.
export async function importDict(json) {
  let o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch { throw new Error('不是有效的字典檔'); }
  if (!o || o.app !== 'pixel-studio-glyphs' || !Array.isArray(o.glyphs)) throw new Error('不是 Pixel Studio 字典檔');
  let n = 0;
  for (const g of o.glyphs) {
    if (!g || !Number.isInteger(g.px) || !Number.isInteger(g.cp) || typeof g.rows !== 'string' || g.rows.length !== g.px * 4 || g.px < 4 || g.px > 32 || g.cp < 1 || g.cp > 0x10ffff) continue;
    const rows = []; for (let i = 0; i < g.px; i++) rows.push(parseInt(g.rows.substr(i * 4, 4), 16));
    if (rows.some(Number.isNaN)) continue;
    await saveGlyph({ ch: String.fromCodePoint(g.cp), px: g.px, rows, adv: g.adv, src: g.src || 'draw' }); n++;
  }
  return n;
}
// Crop/pad a 1-bit bitmap (w×h) to px×px (top-left anchored) → rows
export function bitsToGlyphRows(bits, w, h, px) {
  const rows = [];
  for (let y = 0; y < px; y++) { let r = 0; for (let x = 0; x < Math.min(px, MAX_W, w); x++) if (y < h && bits[y * w + x]) r |= 1 << (15 - x); rows.push(r); }
  return rows;
}
export function inkWidth(rows) { let m = 0; for (const r of rows) for (let i = 15; i >= 0; i--) if (r >> (15 - i) & 1) { m = Math.max(m, i + 1); break; } return m; }
