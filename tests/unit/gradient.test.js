import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../public/js/core/raster.js';

test('fillRegion matches floodFill coverage and respects mask', () => {
  const b = R.createBuffer(6, 6);
  for (let y = 0; y < 6; y++) R.setPixel(b, 6, 6, 3, y, [9, 9, 9, 255]);
  assert.equal(R.fillRegion(b, 6, 6, 0, 0).length, 18);
  assert.equal(R.fillRegion(b, 6, 6, 0, 0, false).length, 30);
  const m = new Uint8Array(36); m[0] = 1; m[1] = 1;
  assert.equal(R.fillRegion(b, 6, 6, 0, 0, true, m).length, 2);
});

test('gradientApply: ends take the endpoint colours and only two colours appear', () => {
  const w = 16, b = R.createBuffer(w, 4);
  const region = R.fillRegion(b, w, 4, 0, 0);
  R.gradientApply(b, w, region, [255, 0, 0, 255], [0, 0, 255, 255], 0, 0, 15, 0);
  assert.deepEqual(Array.from(b.slice(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(b.slice(15 * 4, 15 * 4 + 4)), [0, 0, 255, 255]);
  let blue = 0;
  for (let p = 0; p < w * 4; p++) { assert.ok(b[p * 4] === 255 || b[p * 4 + 2] === 255); if (b[p * 4 + 2] === 255) blue++; }
  assert.ok(blue > 16 && blue < 48);
});

test('gradientApply radial: centre is c1, beyond radius is c2', () => {
  const w = 21, b = R.createBuffer(w, 21);
  const region = R.fillRegion(b, w, 21, 0, 0);
  R.gradientApply(b, w, region, [255, 0, 0, 255], [0, 0, 255, 255], 10, 10, 15, 10, true);
  assert.deepEqual(Array.from(b.slice((10 * w + 10) * 4, (10 * w + 10) * 4 + 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(b.slice(0, 4)), [0, 0, 255, 255]);
  assert.deepEqual(Array.from(b.slice((10 * w + 20) * 4, (10 * w + 20) * 4 + 4)), [0, 0, 255, 255]);
});

test('gradientApply hard: no dither, splits at midpoint', () => {
  const w = 10, b = R.createBuffer(w, 4);
  const region = R.fillRegion(b, w, 4, 0, 0);
  R.gradientApply(b, w, region, [255, 0, 0, 255], [0, 0, 255, 255], 0, 0, 9, 0, false, true);
  for (let y = 0; y < 4; y++) for (let x = 0; x < w; x++) assert.equal(b[(y * w + x) * 4 + 2] === 255, x / 9 >= 0.5);
});

test('gradientApply dither styles: 2/4/8 all keep ends and differ in pattern', () => {
  const w = 16, run = (st) => { const b = R.createBuffer(w, 8); const r = R.fillRegion(b, w, 8, 0, 0); R.gradientApply(b, w, r, [255, 0, 0, 255], [0, 0, 255, 255], 0, 0, 15, 0, false, false, st); return b; };
  const o = [2, 4, 8].map(run);
  for (const b of o) { assert.equal(b[2], 0); assert.equal(b[15 * 4 + 2], 255); }
  assert.notDeepEqual(Array.from(o[0]), Array.from(o[2]));
  assert.deepEqual(Array.from(run(4)), Array.from((() => { const b = R.createBuffer(w, 8); const r = R.fillRegion(b, w, 8, 0, 0); R.gradientApply(b, w, r, [255, 0, 0, 255], [0, 0, 255, 255], 0, 0, 15, 0); return b; })()));
});
