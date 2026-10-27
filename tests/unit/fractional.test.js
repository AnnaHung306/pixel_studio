import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../public/js/core/raster.js';

// B24: iPad 縮放後 pointer 座標為小數；換算成像素格必須用 floor，且不得越界或出現 NaN
const toCell = (c, origin, zoom) => Math.floor((c - origin) / zoom);

test('小數座標換算：負向邊緣不被 round 成 0', () => {
  assert.equal(toCell(99.9, 100, 4), -1);
  assert.equal(toCell(100.0, 100, 4), 0);
  assert.equal(toCell(103.99, 100, 4), 0);
  assert.equal(toCell(104.0, 100, 4), 1);
});

test('小數座標線段：端點為整數格且連續', () => {
  const a = toCell(101.37, 100, 3.5), b = toCell(163.81, 100, 3.5);
  const pts = R.linePoints(a, 0, b, toCell(140.2, 100, 3.5));
  assert.ok(pts.length > 1);
  for (const p of pts) { const [x, y] = Array.isArray(p) ? p : [p.x, p.y]; assert.ok(Number.isInteger(x) && Number.isInteger(y)); }
});
