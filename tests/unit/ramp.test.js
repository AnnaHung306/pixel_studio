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
