// Vector→pixel converter dialog (B61): type text, pick pixel size, tune threshold, preview, hand-fix pixels, place on canvas.
import { h, modal } from './dom.js';
import { app, toast } from './state.js';
import { convertGlyph, canvasRender, binarize } from './core/glyphconv.js';
import { placeBits } from './tools.js';

export function converterDialog(initial = '') {
  const st = { size: 16, threshold: 128, keep: 64, align: true, despeckle: true, bits: null, w: 0, h: 0, edited: false };
  const txt = h('input', { type: 'text', id: 'convText', value: initial || app.ui.textValue || '字', 'aria-label': '要轉換的文字', placeholder: '輸入要轉換的字' });
  const cv = h('canvas', { id: 'convPreview', style: { imageRendering: 'pixelated', border: '1px solid #666', maxWidth: '100%', background: '#fff', touchAction: 'none' } });
  const info = h('div', { class: 'small', id: 'convInfo' });
  let cache = null; // { raws:[{a,...}] } recomputed when text/size/align change
  const rasterize = () => {
    const chars = [...txt.value].filter((c) => !/\s/.test(c)).slice(0, 12);
    const S = st.size;
    cache = chars.map((ch) => {
      const rd = canvasRender(ch, S);
      const r = convertGlyph(rd, S, S, { align: st.align, threshold: st.threshold, keep: st.keep, despeckle: st.despeckle });
      return { ch, a: rd(r.dx, r.dy) };
    });
  };
  const rebin = () => {
    const S = st.size, n = cache.length;
    st.w = S * n; st.h = S; st.bits = new Uint8Array(st.w * st.h);
    cache.forEach((c, i) => {
      const b = binarize(c.a, S, S, { threshold: st.threshold, keep: st.keep, despeckle: st.despeckle });
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) st.bits[y * st.w + i * S + x] = b[y * S + x];
    });
    st.edited = false;
    draw();
  };
  const redo = () => { rasterize(); rebin(); };
  const draw = () => {
    const Z = Math.max(4, Math.min(16, Math.floor(480 / Math.max(1, st.w))));
    cv.width = Math.max(1, st.w) * Z; cv.height = st.h * Z; cv.dataset.zoom = Z;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#000';
    let ink = 0;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (st.bits[y * st.w + x]) { g.fillRect(x * Z, y * Z, Z, Z); ink++; }
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.beginPath();
    for (let x = 0; x <= st.w; x++) { g.moveTo(x * Z + .5, 0); g.lineTo(x * Z + .5, cv.height); }
    for (let y = 0; y <= st.h; y++) { g.moveTo(0, y * Z + .5); g.lineTo(cv.width, y * Z + .5); }
    g.stroke();
    info.textContent = `${st.w}×${st.h} 像素，${ink} 點${st.edited ? '（已手修）' : ''}。點格子可切換像素。`;
  };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), Z = +cv.dataset.zoom * (r.width / cv.width);
    const x = Math.floor((e.clientX - r.left) / Z), y = Math.floor((e.clientY - r.top) / Z);
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return;
    const i = y * st.w + x; st.bits[i] = st.bits[i] ? 0 : 1; st.edited = true; draw();
  });
  const slider = (id, label, key, min, max, step, fn) => {
    const val = h('span', { class: 'small' }, String(st[key]));
    const r = h('input', { type: 'range', id, min, max, step, value: st[key], 'aria-label': label, oninput: () => { st[key] = +r.value; val.textContent = r.value; fn(); } });
    return h('label', { class: 'field' }, h('span', {}, label), r, val);
  };
  const size = h('select', { id: 'convSize', 'aria-label': '目標像素大小', onchange: () => { st.size = +size.value; redo(); } }, [8, 10, 12, 14, 16, 20, 24, 32].map((n) => h('option', { value: n, selected: n === st.size }, n + 'px')));
  const align = h('input', { type: 'checkbox', id: 'convAlign', checked: true, onchange: () => { st.align = align.checked; redo(); } });
  const desp = h('input', { type: 'checkbox', id: 'convDesp', checked: true, onchange: () => { st.despeckle = desp.checked; rebin(); } });
  txt.addEventListener('input', redo);
  const body = h('div', {},
    h('div', { class: 'small' }, '用系統向量字型在目標大小渲染，再轉成乾淨 1-bit 點陣（自動找最清楚的對齊、保留細筆畫、去孤點）。'),
    h('label', { class: 'field' }, h('span', {}, '文字'), txt),
    h('label', { class: 'field' }, h('span', {}, '像素大小'), size),
    slider('convThr', '門檻', 'threshold', 40, 220, 1, rebin),
    slider('convKeep', '細筆畫保留', 'keep', 0, 120, 1, rebin),
    h('label', { class: 'field' }, align, h('span', {}, ' 自動對齊像素格')),
    h('label', { class: 'field' }, desp, h('span', {}, ' 去除孤立點')),
    cv, info);
  const d = modal({
    title: '向量→像素 轉換器', body, wide: true,
    buttons: [{ label: '取消', value: null }, {
      label: '放到畫布', class: 'primary', onClick: () => {
        if (!st.bits || !st.bits.some((v) => v)) { toast('沒有可放置的像素'); return false; }
        placeBits(st.bits, st.w, st.h); toast('已放置，可拖曳後點「✓ 放置」');
      },
    }],
  });
  redo();
  return d.promise;
}
