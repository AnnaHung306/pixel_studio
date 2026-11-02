import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAseprite } from '../../public/js/formats.js';
import { inflateSync } from 'node:zlib';
test('aseprite writer: header, layers, cels, tags', async () => {
  const meta = { width: 2, height: 2, layers: [{ name: 'A', visible: true, opacity: 1, blend: 'normal' }, { name: 'B', visible: false, opacity: 0.5, blend: 'multiply' }], frames: [{ duration: 100 }, { duration: 250 }], tags: [{ name: 'run', from: 0, to: 1, direction: 'forward' }] };
  const px = new Uint8ClampedArray(16).fill(7);
  const blob = await encodeAseprite(meta, (li, fi) => (li === 0 ? px : null));
  const b = Buffer.from(await blob.arrayBuffer()); const dv = new DataView(b.buffer, b.byteOffset, b.length);
  assert.equal(dv.getUint32(0, true), b.length); assert.equal(dv.getUint16(4, true), 0xA5E0);
  assert.equal(dv.getUint16(6, true), 2); assert.equal(dv.getUint16(12, true), 32);
  assert.equal(dv.getUint16(128 + 4, true), 0xF1FA); assert.equal(dv.getUint16(128 + 8, true), 100);
  // walk chunks of frame 0
  let o = 128 + 16; const types = []; const end = 128 + dv.getUint32(128, true);
  while (o < end) { const sz = dv.getUint32(o, true), t = dv.getUint16(o + 4, true); types.push(t);
    if (t === 0x2005) { const raw = inflateSync(b.subarray(o + 6 + 20, o + sz)); assert.equal(raw.length, 16); assert.equal(raw[0], 7); }
    o += sz; }
  assert.deepEqual(types, [0x2004, 0x2004, 0x2018, 0x2005]);
  assert.equal(o, end);
});
