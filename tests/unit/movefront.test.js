import test from 'node:test';
import assert from 'node:assert/strict';
import { moveColorToFront } from '../../public/js/core/palettes.js';
test('moveColorToFront moves a color, case-insensitive; no-op when first/missing', () => {
  assert.deepEqual(moveColorToFront(['#aa', '#bb', '#cc'], '#CC'), ['#cc', '#aa', '#bb']);
  assert.deepEqual(moveColorToFront(['#aa', '#bb'], '#aa'), ['#aa', '#bb']);
  assert.deepEqual(moveColorToFront(['#aa'], '#zz'), ['#aa']);
});
