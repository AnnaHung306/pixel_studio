import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupePalette } from '../../public/js/core/palettes.js';
test('dedupePalette keeps first, case-insensitive', () => {
  assert.deepEqual(dedupePalette(['#ff0000ff', '#00ff00ff', '#FF0000FF', '#00ff00ff']), ['#ff0000ff', '#00ff00ff']);
  assert.deepEqual(dedupePalette([]), []);
});
