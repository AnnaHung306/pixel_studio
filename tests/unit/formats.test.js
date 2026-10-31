import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeZip, encodeGIF, decodeGIF } from '../../public/js/formats.js';
import { parsePaletteFile, paletteToGpl, paletteToHex } from '../../public/js/core/palettes.js';

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('makeZip writes valid local headers and end-of-central-directory', async () => {
  const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }, { name: '資料/b.json', data: new TextEncoder().encode('{}') }]);
  const u = z instanceof Uint8Array ? z : new Uint8Array(await z.arrayBuffer());
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(u.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(u.length - 22 + 10, true), 2);
});

test('GIF encode → decode round-trip keeps pixels, transparency and timing', async () => {
  const w = 4, h = 3;
  const mk = (c) => { const b = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) b.set(i % 2 ? c : [0, 0, 0, 0], i * 4); return b; };
  const frames = [{ buf: mk([255, 0, 0, 255]), duration: 100 }, { buf: mk([0, 128, 255, 255]), duration: 250 }];
  const out = decodeGIF(new Uint8Array(await encodeGIF(frames, w, h).arrayBuffer()));
  assert.equal(out.width, w); assert.equal(out.height, h);
  assert.equal(out.frames.length, 2);
  assert.deepEqual([...out.frames[1].buf.slice(4, 8)], [0, 128, 255, 255]);
  assert.equal(out.frames[0].buf[3], 0, 'transparent pixel preserved');
  assert.equal(out.frames[1].duration, 250);
});

test('GIF encoder reduces > 255 colours without throwing', async () => {
  const w = 32, h = 32, b = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) b.set([i & 255, (i >> 2) & 255, (i * 7) & 255, 255], i * 4);
  const out = decodeGIF(new Uint8Array(await encodeGIF([{ buf: b, duration: 100 }], w, h).arrayBuffer()));
  assert.equal(out.frames.length, 1);
});

test('palette files: .gpl and .hex parse and re-export', () => {
  const cols = ['#ff0000ff', '#00ff80ff'];
  assert.deepEqual(parsePaletteFile(paletteToGpl(cols), 'x.gpl'), cols);
  assert.deepEqual(parsePaletteFile(paletteToHex(cols), 'x.hex'), cols);
  assert.deepEqual(parsePaletteFile('nonsense\n#12345', 'x.hex'), []);
});

import { sheetGeometry } from '../../public/js/formats.js';
test('sheetGeometry: no padding matches plain strips and grids', () => {
  const g = sheetGeometry(4, 16, 8, 'horizontal');
  assert.deepEqual([g.width, g.height], [64, 8]);
  const v = sheetGeometry(3, 16, 8, 'vertical');
  assert.deepEqual([v.width, v.height], [16, 24]);
  const gr = sheetGeometry(5, 10, 10, 'grid', 2);
  assert.deepEqual([gr.cols, gr.rows, gr.width, gr.height], [2, 3, 20, 30]);
  assert.deepEqual(gr.cells[3], { x: 10, y: 10 });
});
test('sheetGeometry: padding surrounds and separates frames', () => {
  const g = sheetGeometry(3, 16, 16, 'horizontal', 8, 2);
  assert.deepEqual([g.width, g.height], [3 * 16 + 4 * 2, 20]);
  assert.deepEqual(g.cells.map((c) => c.x), [2, 20, 38]);
  assert.equal(sheetGeometry(2, 4, 4, 'grid', 0, 999).pad, 64);
});

test('sheetGeometry: pow2 rounds canvas up to powers of two', () => {
  const g = sheetGeometry(5, 10, 10, 'horizontal', 8, 0, true);
  assert.equal(g.width, 64); assert.equal(g.height, 16);
  assert.equal(sheetGeometry(4, 16, 16, 'horizontal', 8, 0, true).width, 64);
  assert.equal(sheetGeometry(3, 10, 10, 'horizontal').width, 30);
});
