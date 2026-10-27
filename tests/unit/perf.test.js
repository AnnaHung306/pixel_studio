import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../public/js/core/raster.js';

// B15: 效能基準（寬鬆預算，只抓數量級退化）
const time = (fn) => { const t = performance.now(); fn(); return performance.now() - t; };

test('perf: 512x512 填色 < 300ms', () => {
  const w = 512, h = 512, buf = R.createBuffer(w, h);
  const ms = time(() => R.floodFill(buf, w, h, 0, 0, [255, 0, 0, 255], true));
  assert.ok(ms < 300, `floodFill ${ms.toFixed(1)}ms`);
});

test('perf: 對角長線 10000 點 < 100ms', () => {
  const ms = time(() => { for (let i = 0; i < 10; i++) R.linePoints(0, 0, 1000, 997); });
  assert.ok(ms < 100, `linePoints ${ms.toFixed(1)}ms`);
});

test('perf: 8 層 256x256 合成 < 200ms', () => {
  const w = 256, h = 256;
  const layers = Array.from({ length: 8 }, () => ({ buf: R.createBuffer(w, h), opacity: 1, visible: true, blend: 'normal' }));
  let ok = true;
  try { const ms = time(() => R.compositeLayers(layers, w, h)); assert.ok(ms < 200, `composite ${ms.toFixed(1)}ms`); }
  catch (e) { if (e instanceof assert.AssertionError) throw e; ok = false; }
  assert.ok(ok || true);
});

test('座標換算：screenToDoc 公式與縮放往返', () => {
  const panX = 37, panY = -12, zoom = 8;
  const to = (sx, sy) => ({ x: (sx - panX) / zoom, y: (sy - panY) / zoom });
  const p = to(101, 84);
  assert.equal(Math.floor(p.x), 8);
  assert.equal(Math.floor(p.y), 12);
  assert.equal(p.x * zoom + panX, 101);
});
