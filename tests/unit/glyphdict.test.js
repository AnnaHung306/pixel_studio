import test from 'node:test';
import assert from 'node:assert/strict';
import { setBackend, loadDict, saveGlyph, dictGlyph, deleteGlyph, exportDict, importDict, listGlyphs, bitsToGlyphRows, inkWidth, dictSize } from '../../public/js/core/glyphdict.js';

const mem = new Map();
setBackend({ all: async () => [...mem.values()], put: async (r) => { mem.set(r.px + ':' + r.cp, r); }, del: async (key) => { mem.delete(key); } });

test('glyphdict: CRUD + persistence reload', async () => {
  await saveGlyph({ ch: '永', px: 12, rows: [0x8000, 0x4000], adv: 12 });
  assert.equal(dictGlyph(0x6c38, 12).rows.length, 12);
  assert.equal(dictGlyph(0x6c38, 12).rows[0], 0x8000);
  assert.equal(dictGlyph(0x6c38, 10), null);
  await loadDict(); assert.ok(dictGlyph(0x6c38, 12).user);
  await deleteGlyph(12, 0x6c38); assert.equal(dictGlyph(0x6c38, 12), null); assert.equal(mem.size, 0);
});
test('glyphdict: export/import roundtrip + invalid skipped', async () => {
  await saveGlyph({ ch: 'A', px: 8, rows: [0x1800, 0x2400] });
  await saveGlyph({ ch: '字', px: 16, rows: [0xffff] });
  const json = exportDict();
  await deleteGlyph(8, 65); await deleteGlyph(16, 0x5b57);
  assert.equal(await importDict(json), 2);
  assert.equal(dictGlyph(65, 8).rows[1], 0x2400);
  const bad = JSON.parse(json); bad.glyphs.push({ px: 8, cp: 66, rows: 'zz' }); bad.glyphs.push(null);
  assert.equal(await importDict(bad), 2);
  await assert.rejects(importDict('{"x":1}'));
  await assert.rejects(importDict('nope'));
});
test('glyphdict: list filter, crop and ink width', async () => {
  assert.ok(dictSize() >= 2);
  assert.ok(listGlyphs({ px: 8 }).every((r) => r.px === 8));
  assert.equal(listGlyphs({ q: '字' }).length, 1);
  const rows = bitsToGlyphRows(Uint8Array.from([1, 0, 1, 0, 1, 1]), 3, 2, 4);
  assert.deepEqual(rows, [0xa000, 0x6000, 0, 0]);
  assert.equal(inkWidth([0xa000]), 3);
});
