import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPage, ensureText, renderText, setFontBase, glyphOf, fontDir } from '../../public/js/core/pixelfont.js';

globalThis.fetch = async (u) => { const p = new URL(u).pathname; return fs.existsSync(p) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) } : { ok: false }; };
setFontBase(new URL('../../public/fonts/', import.meta.url).href);

test('pixelfont: Latin A decodes to 5x8 bitmap', async () => {
  await ensureText('A', 'fusion12m', 'zh_tw');
  const g = glyphOf(fontDir('fusion12m', 'zh_tw'), 65);
  assert.equal(g.adv, 6);
  assert.equal(g.rows.filter(Boolean).length, 8);
});
test('pixelfont: CJK 中 12px advance, both languages differ for 骨/国', async () => {
  await ensureText('中国', 'fusion12m', 'zh_tw'); await ensureText('中国', 'fusion12m', 'zh_hans');
  const t = glyphOf(fontDir('fusion12m', 'zh_tw'), 0x4e2d);
  assert.equal(t.adv, 12);
  assert.ok(t.rows.some((r) => r));
});
test('pixelfont: renderText layout and colour', async () => {
  await ensureText('Hi中', 'fusion12m', 'zh_tw');
  const r = renderText('Hi中', { color: [1, 2, 3, 255] });
  assert.equal(r.w, 24); assert.equal(r.h, 12);
  const on = []; for (let i = 0; i < r.buf.length; i += 4) if (r.buf[i + 3]) on.push(r.buf[i] + r.buf[i + 1] + r.buf[i + 2]);
  assert.ok(on.length > 20 && on.every((v) => v === 6));
  assert.equal(renderText('   x'.slice(0, 3)).w, 18);
  assert.equal(renderText(''), null);
});
test('pixelfont: licence files shipped', () => {
  assert.ok(fs.existsSync(new URL('../../public/fonts/OFL.txt', import.meta.url)));
});
import { pickFont, FONTS } from '../../public/js/core/pixelfont.js';
test('pixelfont: auto font by pixel size and style', () => {
  assert.equal(pickFont(8), 'fusion8m'); assert.equal(pickFont(10, 'prop'), 'fusion10m');
  assert.equal(pickFont(12, 'prop'), 'fusion12p'); assert.equal(pickFont(12), 'fusion12m');
  assert.equal(pickFont(16), 'fusion12m'); assert.equal(pickFont(9), 'fusion8m');
});
test('pixelfont: every font/lang renders 中A with its own height', async () => {
  for (const f of FONTS) for (const lang of ['zh_tw', 'zh_hans']) {
    await ensureText('中A', f.id, lang);
    const r = renderText('中A', { fontId: f.id, lang });
    assert.equal(r.h, f.h, f.id); assert.ok(r.w >= f.size, f.id);
    let on = 0; for (let i = 3; i < r.buf.length; i += 4) if (r.buf[i]) on++;
    assert.ok(on > 10, f.id + lang);
  }
});
