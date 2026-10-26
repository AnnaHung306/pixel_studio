import test from 'node:test';
import assert from 'node:assert/strict';
import { docToJSON, docFromJSON } from '../../public/js/storage.js';
import { app, newDoc, setDoc, commit, undo, redo, historyBytes, enforceHistoryBudget, defaultHistoryBudget, activeKey } from '../../public/js/state.js';

const MB = 1048576;
function paint(v) {
  commit('paint ' + v, () => { const k = activeKey(); const b = new Uint8ClampedArray(app.doc.meta.width * app.doc.meta.height * 4); b.fill(v); app.doc.cels.set(k, b); });
}

test('.pxs round-trip preserves meta, cels and refs; rejects foreign JSON', () => {
  const d = newDoc({ name: '測試', width: 4, height: 4 });
  const k = `${d.meta.layers[0].id}:${d.meta.frames[0].id}`;
  const b = new Uint8ClampedArray(64); b[0] = 200; b[3] = 255;
  d.cels.set(k, b); d.refs.set('r1', 'data:image/png;base64,AAAA');
  const back = docFromJSON(JSON.parse(JSON.stringify(docToJSON(d))));
  assert.equal(back.meta.name, '測試');
  assert.deepEqual([...back.cels.get(k)], [...b]);
  assert.equal(back.refs.get('r1'), 'data:image/png;base64,AAAA');
  assert.throws(() => docFromJSON({ format: 'other' }));
});

test('.pxs import drops cels with the wrong size', () => {
  const d = newDoc({ width: 2, height: 2 });
  const j = docToJSON(d); j.cels['bad:key'] = Buffer.from(new Uint8Array(5)).toString('base64');
  assert.equal(docFromJSON(j).cels.has('bad:key'), false);
});

test('undo/redo restore the exact buffers', () => {
  setDoc(newDoc({ width: 8, height: 8 }));
  paint(1); paint(2);
  assert.equal(app.doc.cels.get(activeKey())[0], 2);
  undo(); assert.equal(app.doc.cels.get(activeKey())[0], 1);
  redo(); assert.equal(app.doc.cels.get(activeKey())[0], 2);
});

test('historyBytes counts only buffers kept alive by history', () => {
  setDoc(newDoc({ width: 64, height: 64 }));
  const cel = 64 * 64 * 4;
  paint(1); // before had no cel → nothing old to keep
  const h1 = historyBytes();
  paint(2); paint(3);
  const h3 = historyBytes();
  assert.ok(h3 - h1 >= 2 * cel && h3 - h1 < 2 * cel + 20000, `two replaced cels retained (${h3 - h1})`);
  undo(); // now version 3 is only in redo, version 2 is live
  const hu = historyBytes();
  assert.ok(Math.abs(hu - h3) < 20000, 'undo moves one buffer from undo to redo accounting');
});

test('byte budget trims oldest steps but keeps the newest minKeep', () => {
  setDoc(newDoc({ width: 128, height: 128 })); // 64 KB per cel
  const h = app.history; const saved = h.budget;
  h.budget = 1 * MB;
  for (let i = 0; i < 40; i++) paint(i);
  assert.ok(historyBytes() <= h.budget, 'within budget');
  assert.ok(h.undo.length >= h.minKeep && h.undo.length < 40, `trimmed (${h.undo.length} left)`);
  assert.ok(h.trimmed > 0);
  h.budget = 1; enforceHistoryBudget();
  assert.equal(h.undo.length, h.minKeep, 'never below minKeep');
  h.budget = saved;
});

test('step cap of 200', () => {
  setDoc(newDoc({ width: 2, height: 2 }));
  for (let i = 0; i < 230; i++) paint(i % 250);
  assert.equal(app.history.undo.length, 200);
});

test('default budget: iPad 96 MB, low-memory 128 MB, desktop 320 MB', () => {
  assert.equal(defaultHistoryBudget({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }), 96 * MB);
  assert.equal(defaultHistoryBudget({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), 96 * MB);
  assert.equal(defaultHistoryBudget({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', deviceMemory: 4 }), 128 * MB);
  assert.equal(defaultHistoryBudget({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 320 * MB);
});

test('performance guard: commit on 256×256 × 10 layers × 50 frames with full history stays fast', () => {
  const d = newDoc({ width: 256, height: 256 });
  const n = 256 * 256 * 4;
  for (let l = 1; l < 10; l++) d.meta.layers.push({ ...d.meta.layers[0], id: 'L' + l, name: 'L' + l });
  for (let f = 1; f < 50; f++) d.meta.frames.push({ ...d.meta.frames[0], id: 'F' + f });
  for (const L of d.meta.layers) for (const F of d.meta.frames) d.cels.set(`${L.id}:${F.id}`, new Uint8ClampedArray(n));
  setDoc(d);
  app.history.budget = 10 * 1024 * MB; // measure cost, not trimming
  for (let i = 0; i < 150; i++) paint(i);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) paint(200 + i);
  const per = (performance.now() - t0) / 20;
  assert.ok(per < 40, `commit ${per.toFixed(1)} ms`);
  app.history.budget = defaultHistoryBudget();
});
