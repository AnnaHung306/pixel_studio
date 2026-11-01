import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuffer, contentBBox, tweenCel } from '../../public/js/core/raster.js';
const mk = (x, y) => { const b = createBuffer(8, 8); const i = (y * 8 + x) * 4; b.set([255, 0, 0, 255], i); return b; };
test('contentBBox', () => {
  assert.equal(contentBBox(createBuffer(4, 4), 4, 4), null);
  assert.deepEqual(contentBBox(mk(2, 3), 8, 8), { x0: 2, y0: 3, x1: 2, y1: 3 });
});
test('tweenCel moves halfway and fades', () => {
  const a = mk(0, 0), sb = contentBBox(a, 8, 8), eb = contentBBox(mk(4, 2), 8, 8);
  const m = tweenCel(a, 8, 8, sb, eb, 0.5, 'out');
  assert.equal(m[(1 * 8 + 2) * 4 + 3], 128);
  assert.equal(tweenCel(a, 8, 8, sb, eb, 0.5)[(1 * 8 + 2) * 4 + 3], 255);
});
