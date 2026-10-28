import test from 'node:test';
import assert from 'node:assert/strict';
import { pressureSizeFor } from '../../public/js/tools.js';

test('pressureSizeFor: no threshold behaves as before', () => {
  assert.equal(pressureSizeFor(0, 8), 1);
  assert.equal(pressureSizeFor(1, 8), 8);
  assert.equal(pressureSizeFor(0.5, 9), 5);
});
test('pressureSizeFor: dead zone keeps light touches at size 1 and rescales the rest', () => {
  assert.equal(pressureSizeFor(0.2, 8, 0.3), 1);
  assert.equal(pressureSizeFor(0.3, 8, 0.3), 1);
  assert.equal(pressureSizeFor(1, 8, 0.3), 8);
  assert.ok(pressureSizeFor(0.65, 9, 0.3) > 1);
  assert.equal(pressureSizeFor(0.5, 9, undefined), 5);
});
