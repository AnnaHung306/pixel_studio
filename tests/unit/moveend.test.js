import test from 'node:test';
import assert from 'node:assert/strict';
import { moveColorToEnd } from '../../public/js/core/palettes.js';
test('moveColorToEnd moves a color, case-insensitive; no-op when last/missing', () => {
  assert.deepEqual(moveColorToEnd(['#aa', '#bb', '#cc'], '#AA'), ['#bb', '#cc', '#aa']);
  assert.deepEqual(moveColorToEnd(['#aa', '#bb'], '#bb'), ['#aa', '#bb']);
  assert.deepEqual(moveColorToEnd(['#aa'], '#zz'), ['#aa']);
});
