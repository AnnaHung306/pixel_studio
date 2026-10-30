import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPalette } from '../../public/js/core/palettes.js';
test('sortPalette lum: dark to light, stable, keeps all', () => {
  const l = ['#ffffffff', '#000000ff', '#808080ff', '#ff0000ff'];
  const o = sortPalette(l, 'lum');
  assert.deepEqual(o, ['#000000ff', '#ff0000ff', '#808080ff', '#ffffffff']);
  assert.equal(o.length, l.length);
});
test('sortPalette hue: grays first, then red→green→blue', () => {
  const o = sortPalette(['#0000ffff', '#00ff00ff', '#ffffffff', '#ff0000ff', '#000000ff'], 'hue');
  assert.deepEqual(o, ['#000000ff', '#ffffffff', '#ff0000ff', '#00ff00ff', '#0000ffff']);
});
