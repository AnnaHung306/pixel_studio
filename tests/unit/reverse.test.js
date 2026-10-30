import test from 'node:test';
import assert from 'node:assert/strict';
import { reversePalette } from '../../public/js/core/palettes.js';
test('reversePalette reverses without mutating', () => {
  const a = ['#111111ff', '#222222ff', '#333333ff'];
  assert.deepEqual(reversePalette(a), ['#333333ff', '#222222ff', '#111111ff']);
  assert.deepEqual(a[0], '#111111ff');
  assert.deepEqual(reversePalette([]), []);
});
