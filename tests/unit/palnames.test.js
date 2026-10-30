import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaletteNames, paletteToGpl, parsePaletteFile } from '../../public/js/core/palettes.js';

test('gpl export writes names and import round-trips them', () => {
  const pal = ['#d95763ff', '#222034ff'];
  const gpl = paletteToGpl(pal, 'T', { '#d95763ff': 'Brick Red' });
  assert.match(gpl, /217\s+87\s+99\tBrick Red/);
  assert.match(gpl, /34\s+32\s+52\t222034/);
  const names = parsePaletteNames(gpl);
  assert.deepEqual(names, { '#d95763ff': 'Brick Red' });
  assert.deepEqual(parsePaletteFile(gpl, 'a.gpl'), pal);
});
test('parsePaletteNames ignores hex labels, Untitled, and caps length', () => {
  const t = 'GIMP Palette\n  1   2   3\tUntitled\n  4   5   6\t040506\n  7   8   9\t' + 'x'.repeat(60) + '\n';
  const n = parsePaletteNames(t);
  assert.equal(Object.keys(n).length, 1);
  assert.equal(n['#070809ff'].length, 40);
});
