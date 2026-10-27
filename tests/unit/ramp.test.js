import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRamp } from '../../public/js/core/palettes.js';

const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; };
test('makeRamp: odd length, middle is base, luminance rises', () => {
  const r = makeRamp('#d95763', 7);
  assert.equal(r.length, 7);
  assert.equal(r[3], '#d95763ff');
  for (let i = 1; i < r.length; i++) assert.ok(lum(r[i]) > lum(r[i - 1]), `step ${i}`);
});
test('makeRamp: clamps n, handles gray and black, valid hex', () => {
  assert.equal(makeRamp('#808080', 99).length, 15);
  assert.equal(makeRamp('#000000', 1).length, 3);
  for (const c of [...makeRamp('#000000', 5), ...makeRamp('#ffffff', 5), ...makeRamp('#808080', 5)]) assert.match(c, /^#[0-9a-f]{8}$/);
});
import { shadeStep } from '../../public/js/core/palettes.js';
test('shadeStep: darker/lighter change luminance, keep alpha, stay valid', () => {
  const c = [217, 87, 99, 128];
  const d = shadeStep(c, -1), l = shadeStep(c, 1);
  const L = (v) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
  assert.ok(L(d) < L(c) && L(l) > L(c));
  assert.equal(d[3], 128); assert.equal(l[3], 128);
  for (const v of [...d, ...l]) assert.ok(v >= 0 && v <= 255);
});

import { nearestPaletteColor } from '../../public/js/core/palettes.js';
test('nearestPaletteColor: picks nearest, keeps alpha, handles empty', () => {
  const pal = ['#ff0000ff', '#00ff00ff', '#0000ffff'];
  assert.deepEqual(nearestPaletteColor([250, 10, 10, 128], pal), [255, 0, 0, 128]);
  assert.deepEqual(nearestPaletteColor([10, 20, 240, 255], pal), [0, 0, 255, 255]);
  assert.deepEqual(nearestPaletteColor([1, 2, 3, 255], []), [1, 2, 3, 255]);
});
