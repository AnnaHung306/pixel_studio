import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPaletteByUsage } from '../../public/js/core/palettes.js';
test('sortPaletteByUsage orders by pixel count, stable on ties', () => {
  const cel = new Uint8ClampedArray([0, 255, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 9, 9, 9, 0]);
  assert.deepEqual(sortPaletteByUsage(['#0000ffff', '#ff0000ff', '#00ff00ff', '#aaaaaaff'], [cel]), ['#00ff00ff', '#ff0000ff', '#0000ffff', '#aaaaaaff']);
});
