import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFill } from '../../public/js/core/raster.js';

function buf(w, h, rgba) { const b = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) b.set(rgba, p * 4); return b; }

test('油漆桶可用透明色清除連通的色塊（B41）', () => {
  const b = buf(4, 4, [255, 0, 0, 255]);
  b.set([0, 0, 255, 255], 5 * 4); // 單一藍點
  const n = floodFill(b, 4, 4, 0, 0, [0, 0, 0, 0], true);
  assert.equal(n, 15);
  assert.equal(b[3], 0);
  assert.equal(b[5 * 4 + 3], 255);
});

test('透明區域用透明色再填不動作', () => {
  const b = buf(3, 3, [0, 0, 0, 0]);
  assert.equal(floodFill(b, 3, 3, 1, 1, [0, 0, 0, 0], true), 0);
});

test('不同 RGB 的全透明像素視為同一區域', () => {
  const b = buf(3, 1, [0, 0, 0, 0]);
  b.set([9, 9, 9, 0], 4);
  assert.equal(floodFill(b, 3, 1, 0, 0, [255, 0, 0, 255], true), 3);
});

import { limitScale } from '../../public/js/core/raster.js';
test('匯出倍率防護 limitScale（B40）', () => {
  assert.equal(limitScale(8, 64, 64), 8);
  assert.equal(limitScale(32, 1024, 1024), 4);
  assert.equal(limitScale(0, 16, 16), 1);
  assert.equal(limitScale(50, 4096, 4096), 1);
});
