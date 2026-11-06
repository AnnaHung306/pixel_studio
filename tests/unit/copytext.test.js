import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteToCopyText } from '../../public/js/core/palettes.js';
test('paletteToCopyText joins uppercase hex with spaces', () => {
  assert.equal(paletteToCopyText(['#aabbcc', '#00ff00']), '#AABBCC #00FF00');
  assert.equal(paletteToCopyText([]), '');
  assert.equal(paletteToCopyText(null), '');
});
