import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../public/js/core/raster.js';

test('hexToRgba / rgbaToHex round-trip incl. short and alpha forms', () => {
  assert.deepEqual(R.hexToRgba('#ff8000'), [255, 128, 0, 255]);
  assert.deepEqual(R.hexToRgba('#f80'), [255, 136, 0, 255]);
  assert.deepEqual(R.hexToRgba('11223344'), [0x11, 0x22, 0x33, 0x44]);
  assert.equal(R.rgbaToHex([255, 128, 0, 255]), '#ff8000ff');
  assert.equal(R.rgbaToHex([1, 2, 3, 4], false), '#010203');
  assert.throws(() => R.hexToRgba('#xyz123'));
});

test('setPixel/getPixel bounds and source-over blending', () => {
  const b = R.createBuffer(4, 4);
  assert.equal(R.setPixel(b, 4, 4, -1, 0, [1, 1, 1, 255]), false);
  assert.deepEqual(R.getPixel(b, 4, 4, 9, 9), [0, 0, 0, 0]);
  R.setPixel(b, 4, 4, 1, 1, [255, 0, 0, 255]);
  R.setPixel(b, 4, 4, 1, 1, [0, 0, 255, 128], 'over');
  const p = R.getPixel(b, 4, 4, 1, 1);
  assert.equal(p[3], 255);
  assert.ok(p[0] > 100 && p[2] > 100, 'blended red+blue');
});

test('linePoints is gap-free (8-connected) and includes endpoints', () => {
  const pts = R.linePoints(0, 0, 7, 3);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[pts.length - 1], [7, 3]);
  for (let i = 1; i < pts.length; i++) assert.ok(Math.max(Math.abs(pts[i][0] - pts[i - 1][0]), Math.abs(pts[i][1] - pts[i - 1][1])) === 1);
});

test('rect / ellipse outline vs filled', () => {
  assert.equal(R.rectPoints(0, 0, 3, 3, true).length, 16);
  assert.equal(new Set(R.rectPoints(0, 0, 3, 3, false).map(String)).size, 12);
  const e = R.ellipsePoints(0, 0, 8, 8, true);
  assert.ok(e.length > 40 && e.length < 81);
});

test('floodFill contiguous, global, mask and no-op on same colour', () => {
  const w = 5, h = 5, b = R.createBuffer(w, h);
  for (let y = 0; y < h; y++) R.setPixel(b, w, h, 2, y, [0, 0, 0, 255]); // vertical wall
  assert.equal(R.floodFill(b, w, h, 0, 0, [255, 0, 0, 255]), 10);
  assert.equal(R.floodFill(b, w, h, 0, 0, [255, 0, 0, 255]), 0);
  const g = R.createBuffer(w, h);
  for (let y = 0; y < h; y++) R.setPixel(g, w, h, 2, y, [0, 0, 0, 255]);
  assert.equal(R.floodFill(g, w, h, 0, 0, [1, 1, 1, 255], false), 20);
  const m = new Uint8Array(w * h); m[0] = 1; m[1] = 1;
  const c = R.createBuffer(w, h);
  assert.equal(R.floodFill(c, w, h, 0, 0, [9, 9, 9, 255], true, m), 2);
});

test('flip / rotate / scaleNearest / reframe', () => {
  const b = R.createBuffer(3, 2);
  R.setPixel(b, 3, 2, 0, 0, [1, 2, 3, 255]);
  assert.deepEqual(R.getPixel(R.flipBuffer(b, 3, 2, true), 3, 2, 2, 0), [1, 2, 3, 255]);
  assert.deepEqual(R.getPixel(R.flipBuffer(b, 3, 2, false), 3, 2, 0, 1), [1, 2, 3, 255]);
  const r = R.rotateBuffer(b, 3, 2, true);
  assert.equal(r.w, 2); assert.equal(r.h, 3);
  assert.deepEqual(R.getPixel(r.buf, 2, 3, 1, 0), [1, 2, 3, 255]);
  const s = R.scaleNearest(b, 3, 2, 2);
  assert.deepEqual(R.getPixel(s, 6, 4, 1, 1), [1, 2, 3, 255]);
  const f = R.reframe(b, 3, 2, 5, 5, 1, 1);
  assert.deepEqual(R.getPixel(f, 5, 5, 1, 1), [1, 2, 3, 255]);
});

test('compositeLayers honours visibility and opacity', () => {
  const a = R.createBuffer(1, 1), t = R.createBuffer(1, 1);
  a.set([255, 0, 0, 255]); t.set([0, 0, 255, 255]);
  assert.deepEqual([...R.compositeLayers([{ buf: a }, { buf: t, visible: false }], 1, 1)], [255, 0, 0, 255]);
  const half = R.compositeLayers([{ buf: a }, { buf: t, opacity: 0.5 }], 1, 1);
  assert.ok(half[0] > 100 && half[2] > 100 && half[3] === 255);
});

test('base64 round-trip and isEmpty', () => {
  const b = new Uint8ClampedArray([0, 1, 2, 250, 255, 7, 0, 0]);
  assert.deepEqual([...R.b64ToBytes(R.bytesToB64(b))], [...b]);
  assert.equal(R.isEmpty(R.createBuffer(3, 3)), true);
  assert.equal(R.isEmpty(b), false);
});

test('polygonMask fills the interior', () => {
  const m = R.polygonMask([[0, 0], [7, 0], [7, 7], [0, 7]], 8, 8);
  assert.ok(m[4 * 8 + 4] === 1);
});
