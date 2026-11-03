import test from 'node:test';
import assert from 'node:assert/strict';
import { usedPaletteColors } from '../../public/js/core/palettes.js';
test('usedPaletteColors keeps only colors present in cels', () => {
  const cel = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255]);
  assert.deepEqual(usedPaletteColors(['#ff0000ff', '#00ff00ff', '#0000FFFF', '#00ff00ff'], [cel]), ['#ff0000ff', '#00ff00ff', '#00ff00ff']);
  assert.deepEqual(usedPaletteColors(['#000000ff'], [cel]), []);
});
