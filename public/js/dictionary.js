// Glyph dictionary manager + glyph editor (B62): browse/search/filter, draw or edit a glyph, save a canvas selection as a glyph,
// export / import JSON. Stored globally in IndexedDB (core/glyphdict.js).
import { h, modal, pickFile, readAs, download, confirmBox } from './dom.js';
import { app, toast, activeKey, W } from './state.js';
import { listGlyphs, saveGlyph, deleteGlyph, exportDict, importDict, dictGlyph, bitsToGlyphRows, inkWidth, dictSize } from './core/glyphdict.js';
import { updateText } from './tools.js';

const sizes = [8, 10, 12, 16];
function rowsToBits(rows, px) { const b = new Uint8Array(px * px); for (let y = 0; y < px; y++) for (let x = 0; x < px && x < 16; x++) if (rows[y] >> (15 - x) & 1) b[y * px + x] = 1; return b; }
function thumb(r) {
  const c = h('canvas', { width: r.px, height: r.px, style: { width: r.px * 3 + 'px', height: r.px * 3 + 'px', imageRendering: 'pixelated', background: '#fff', border: '1px solid #888' } });
  const g = c.getContext('2d'); g.fillStyle = '#000';
  for (let y = 0; y < r.px; y++) for (let x = 0; x < Math.min(16, r.px); x++) if (r.rows[y] >> (15 - x) & 1) g.fillRect(x, y, 1, 1);
  return c;
}
// Small pixel editor. init: { ch, px, bits? }. Resolves true when saved.
export function glyphEditor({ ch = '', px = 12, bits = null, src = 'draw' } = {}) {
  const st = { px, bits: bits && bits.length === px * px ? Uint8Array.from(bits) : new Uint8Array(px * px), edited: false };
  const chIn = h('input', { type: 'text', id: 'glyphChar', maxlength: 2, value: ch, 'aria-label': '對應的字元', placeholder: '字' });
  const cv = h('canvas', { id: 'glyphCanvas', style: { imageRendering: 'pixelated', border: '1px solid #666', background: '#fff', touchAction: 'none', maxWidth: '100%' } });
  const sizeSel = h('select', { id: 'glyphSize', 'aria-label': '字形像素大小', onchange: () => resize(+sizeSel.value) }, sizes.map((n) => h('option', { value: n, selected: n === px }, n + 'px')));
  const load = () => { const c = [...chIn.value][0]; const r = c && dictGlyph(c.codePointAt(0), st.px); if (r) { st.bits = rowsToBits(r.rows, st.px); draw(); } };
  const resize = (n) => { const nb = new Uint8Array(n * n); for (let y = 0; y < Math.min(n, st.px); y++) for (let x = 0; x < Math.min(n, st.px); x++) nb[y * n + x] = st.bits[y * st.px + x]; st.px = n; st.bits = nb; draw(); };
  const Z = () => Math.max(6, Math.floor(320 / st.px));
  const draw = () => {
    const z = Z(), n = st.px; cv.width = cv.height = n * z; cv.dataset.zoom = z;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n * z, n * z); g.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (st.bits[y * n + x]) g.fillRect(x * z, y * z, z, z);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.beginPath();
    for (let i = 0; i <= n; i++) { g.moveTo(i * z + .5, 0); g.lineTo(i * z + .5, n * z); g.moveTo(0, i * z + .5); g.lineTo(n * z, i * z + .5); }
    g.stroke();
  };
  let paint = null;
  const cell = (e) => { const r = cv.getBoundingClientRect(), z = Z() * (r.width / cv.width); const x = Math.floor((e.clientX - r.left) / z), y = Math.floor((e.clientY - r.top) / z); return x >= 0 && y >= 0 && x < st.px && y < st.px ? y * st.px + x : -1; };
  cv.addEventListener('pointerdown', (e) => { const i = cell(e); if (i < 0) return; paint = st.bits[i] ? 0 : 1; st.bits[i] = paint; st.edited = true; draw(); try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
  cv.addEventListener('pointermove', (e) => { if (paint === null) return; const i = cell(e); if (i >= 0 && st.bits[i] !== paint) { st.bits[i] = paint; draw(); } });
  const end = () => { paint = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  chIn.addEventListener('change', load);
  const body = h('div', {},
    h('div', { class: 'small' }, '點或拖曳格子畫字形。字形寬度最多 16 格。存入後，文字工具在該像素大小會優先使用這個字。'),
    h('label', { class: 'field' }, h('span', {}, '字元'), chIn),
    h('label', { class: 'field' }, h('span', {}, '像素大小'), sizeSel),
    cv,
    h('div', {}, h('button', { class: 'tb', id: 'glyphClear', onclick: () => { st.bits.fill(0); draw(); } }, '清除')));
  const d = modal({
    title: '字形編輯器', body, wide: true,
    buttons: [{ label: '取消', value: false }, {
      label: '存入字典', class: 'primary', onClick: async () => {
        const c = [...chIn.value][0];
        if (!c) { toast('請輸入這個字形對應的字元'); return false; }
        if (!st.bits.some((v) => v)) { toast('字形是空的'); return false; }
        const rows = bitsToGlyphRows(st.bits, st.px, st.px, st.px);
        await saveGlyph({ ch: c, px: st.px, rows, adv: Math.max(inkWidth(rows) + 1, st.px >> 1), src: src === 'draw' || st.edited ? (src === 'convert' ? 'edit' : src) : src });
        toast('已存入字典：' + c); if (app.ui.tool === 'text') updateText(); return true;
      },
    }],
  });
  draw();
  return d.promise;
}
// Save the current selection (alpha>0 of the active cel, cropped/padded to px×px) as a glyph.
export async function glyphFromSelection() {
  const s = app.selection;
  if (!s) { toast('請先用選取工具框出字形'); return false; }
  const buf = app.doc.cels.get(activeKey());
  const px = [8, 10, 12, 16].find((n) => n >= s.h) || 16;
  const bits = new Uint8Array(px * px);
  for (let y = 0; y < Math.min(s.h, px); y++) for (let x = 0; x < Math.min(s.w, px); x++) {
    const X = s.x + x, Y = s.y + y; if (X < 0 || Y < 0 || X >= W() || !buf) continue;
    if (buf[(Y * W() + X) * 4 + 3] > 0) bits[y * px + x] = 1;
  }
  return glyphEditor({ px, bits, src: 'selection' });
}
export function dictionaryDialog() {
  const st = { px: 0, q: '' };
  const list = h('div', { id: 'dictList', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' } });
  const count = h('div', { class: 'small', id: 'dictCount' });
  const render = () => {
    const gs = listGlyphs(st); list.replaceChildren();
    count.textContent = `字典共 ${dictSize()} 個字形` + (gs.length !== dictSize() ? `，符合 ${gs.length} 個` : '');
    for (const r of gs) {
      list.append(h('div', { class: 'dictItem', style: { textAlign: 'center', fontSize: '12px' } }, thumb(r), h('div', {}, `${r.ch} ${r.px}px`),
        h('button', { class: 'tb', title: '編輯', onclick: async () => { await glyphEditor({ ch: r.ch, px: r.px, bits: rowsToBits(r.rows, r.px), src: r.src }); render(); } }, '✎'),
        h('button', { class: 'tb', title: '刪除', onclick: async () => { if (await confirmBox('刪除字形', '刪除字形「' + r.ch + '」？', '刪除', true)) { await deleteGlyph(r.px, r.cp); if (app.ui.tool === 'text') updateText(); render(); } } }, '🗑')));
    }
    if (!gs.length) list.append(h('div', { class: 'small' }, '還沒有字形。可用轉換器存入、字形編輯器自己畫，或從選取區存成字形。'));
  };
  const q = h('input', { type: 'search', id: 'dictQuery', placeholder: '搜尋字元', 'aria-label': '搜尋字元', oninput: () => { st.q = q.value; render(); } });
  const f = h('select', { id: 'dictFilter', 'aria-label': '依像素大小篩選', onchange: () => { st.px = +f.value; render(); } }, h('option', { value: 0 }, '全部大小'), sizes.map((n) => h('option', { value: n }, n + 'px')));
  const body = h('div', {}, h('div', { class: 'small' }, '全域字典（存在這台裝置，與專案無關）。打字時優先使用這裡的字形。'),
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } }, q, f,
      h('button', { class: 'tb', id: 'dictNew', onclick: async () => { await glyphEditor({}); render(); } }, '＋ 新字形'),
      h('button', { class: 'tb', id: 'dictSel', onclick: async () => { await glyphFromSelection(); render(); } }, '▭ 選取區存成字形'),
      h('button', { class: 'tb', id: 'dictExport', onclick: () => { download(new Blob([exportDict()], { type: 'application/json' }), 'pixel-studio-glyphs.json'); } }, '匯出'),
      h('button', { class: 'tb', id: 'dictImport', onclick: async () => { const fl = await pickFile('.json,application/json'); if (!fl) return; try { const n = await importDict(await readAs(fl, 'text')); toast(`已匯入 ${n} 個字形`); if (app.ui.tool === 'text') updateText(); render(); } catch (e) { toast(e.message); } } }, '匯入')),
    count, list);
  render();
  return modal({ title: '📖 字形字典', body, wide: true, buttons: [{ label: '關閉', value: true }] }).promise;
}
