// IndexedDB backend for the global glyph dictionary (separate DB so it survives project/db resets). ADR-010.
import { setBackend, loadDict } from './core/glyphdict.js';
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const q = indexedDB.open('pixel-studio-glyphs', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('glyphs', { keyPath: 'key' });
  q.onsuccess = () => { const d = q.result; d.onclose = d.onversionchange = () => { dbp = null; }; res(d); };
  q.onerror = () => { dbp = null; rej(q.error); };
}));
const run = (mode, fn) => open().then((d) => new Promise((res, rej) => { const t = d.transaction('glyphs', mode); let out; Promise.resolve(fn(t.objectStore('glyphs'))).then((v) => { out = v; }); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }));
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function initGlyphStore() {
  if (typeof indexedDB === 'undefined') return;
  setBackend({
    all: () => run('readonly', (s) => req(s.getAll())).catch(() => []),
    put: (r) => run('readwrite', (s) => { s.put({ ...r, key: r.px + ':' + r.cp }); }),
    del: (key) => run('readwrite', (s) => { s.delete(key); }),
  });
  try { await loadDict(); } catch { /* dictionary unavailable: built-in fonts still work */ }
}
