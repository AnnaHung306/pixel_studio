import test from 'node:test';
import assert from 'node:assert/strict';
import { binarize, convertGlyph, bitsToRows, inkCount, crispness } from '../../public/js/core/glyphconv.js';

test('glyphconv: threshold splits solid/faint', () => {
  const a = Uint8Array.from([255, 100, 0, 200]);
  const b = binarize(a, 4, 1, { threshold: 128, keep: 0, despeckle: false });
  assert.deepEqual([...b], [1, 0, 0, 1]);
});
test('glyphconv: thin faint stroke next to solid is kept (stroke keeping)', () => {
  // solid column at x=0, faint ridge at x=2 connected diagonally? ridge at (1,1) adjacent to solid
  const w = 3, h = 3;
  const a = new Uint8Array(w * h); a[0] = 255; a[3] = 255; a[6] = 255; a[4] = 90;
  const off = binarize(a, w, h, { keep: 0, despeckle: false });
  const on = binarize(a, w, h, { keep: 64, despeckle: false });
  assert.equal(off[4], 0); assert.equal(on[4], 1);
});
test('glyphconv: isolated faint speckle removed, solid isolated kept', () => {
  const a = new Uint8Array(25); a[0] = 140; a[24] = 255;
  const b = binarize(a, 5, 5, { keep: 0 });
  assert.equal(b[0], 0); assert.equal(b[24], 1);
});
test('glyphconv: offset search picks the crisp alignment', () => {
  const w = 4, h = 4;
  // a vertical bar that is crisp only when shifted by 0.5 in x
  const render = (ox) => { const a = new Uint8Array(w * h); const v = ox === 0.5 ? 255 : 128; for (let y = 0; y < h; y++) a[y * w + 1] = v; if (ox !== 0.5) for (let y = 0; y < h; y++) a[y * w + 2] = 127; return a; };
  const r = convertGlyph(render, w, h);
  assert.equal(r.dx, 0.5);
  assert.equal(inkCount(r.bits), 4);
  assert.ok(crispness(render(0.5)) > crispness(render(0)));
});
test('glyphconv: bitsToRows MSB-left', () => {
  const rows = bitsToRows(Uint8Array.from([1, 0, 0, 1]), 4, 1);
  assert.equal(rows[0], 0x8000 | 0x1000);
});
