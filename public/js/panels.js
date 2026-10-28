// UI panels: toolbar, options bar, color editor, palette, timeline (layers × frames), onion skin, references, history, preview.
import { app, on, emit, setUI, commit, undo, redo, jumpHistory, activeLayer, layerIndex, toast, celKey, historyBytes } from './state.js';
import { h, popupMenu, prompt, modal, pickFile, readAs, download, slider, confirmBox, capture, claimPencil } from './dom.js';
import { TOOLS, selectAll, deselect, invertSelection, copySelection, cutSelection, pasteClip, deleteSelection, transformSelection, customBrushFromSelection, dropFloating, cancelFloating } from './tools.js';
import * as A from './actions.js';
import { hexToRgba, rgbaToHex } from './core/raster.js';
import { PALETTES, parsePaletteFile, paletteToHex, paletteToGpl, makeRamp, shadeStep } from './core/palettes.js';
import { fitView } from './view.js';

// ---------- pixel icons ----------
const ICONS = {
  pencil: ['.........##.', '........#..#', '.......#..#.', '......#..#..', '.....#..#...', '....#..#....', '...#..#.....', '..#..#......', '.##.#.......', '.###........', '.##.........', '............'],
  eraser: ['............', '......####..', '.....#...##.', '....#...#.#.', '...#...#..#.', '..#...#..#..', '.#####..#...', '.#...#.#....', '.#...##.....', '.#####......', '............', '............'],
  fill: ['....#.......', '...#.#......', '..#...#.....', '.#.....#....', '#.......#...', '.#.....###..', '..#...#.##..', '...#.#..##..', '....#...##..', '.........#..', '............', '............'],
  eyedropper: ['.........##.', '........####', '.......####.', '......#.##..', '.....#..#...', '....#..#....', '...#..#.....', '..#..#......', '.#..#.......', '.#.#........', '#.#.........', '............'],
  line: ['............', '..........##', '.........##.', '........##..', '.......##...', '......##....', '.....##.....', '....##......', '...##.......', '..##........', '.##.........', '............'],
  rect: ['............', '.##########.', '.#........#.', '.#........#.', '.#........#.', '.#........#.', '.#........#.', '.#........#.', '.#........#.', '.##########.', '............', '............'],
  ellipse: ['............', '....####....', '..##....##..', '.#........#.', '.#........#.', '#..........#', '#..........#', '.#........#.', '.#........#.', '..##....##..', '....####....', '............'],
  select: ['............', '.##.##.##.#.', '.#........#.', '..........#.', '.#..........', '.#........#.', '..........#.', '.#..........', '.#........#.', '.#.##.##.##.', '............', '............'],
  lasso: ['............', '...######...', '..#......#..', '.#........#.', '.#........#.', '..#......#..', '...##..##...', '.....##.....', '....#.......', '....#.......', '.....#......', '............'],
  move: ['.....##.....', '....####....', '.....##.....', '.....##.....', '.#...##...#.', '############', '############', '.#...##...#.', '.....##.....', '.....##.....', '....####....', '.....##.....'],
  hand: ['.....#......', '...#.#.#....', '...#.#.#.#..', '...#.#.#.#..', '.#.#.#.#.#..', '.#.#######..', '.#########..', '..########..', '..#######...', '...######...', '...######...', '............'],
};
function icon(name) {
  const rows = ICONS[name] || [];
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') rects += `<rect x="${x * 2}" y="${y * 2}" width="2" height="2"/>`; }));
  return `<svg viewBox="0 0 24 24">${rects}</svg>`;
}

const colorBg = (c) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;

// ---------- toolbar ----------
export function renderToolbar() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = '';
  for (const t of TOOLS) {
    tb.append(h('button', { class: 'tool' + (app.ui.tool === t.id ? ' on' : ''), title: `${t.label} (${t.key})`, 'aria-label': t.label, 'aria-pressed': app.ui.tool === t.id ? 'true' : 'false', html: icon(t.id), onclick: () => setTool(t.id) }));
  }
  const p = h('div', { class: 'swatch-p checker' + (app.ui.activeSlot === 'primary' ? ' active' : ''), title: '主要顏色（點選後編輯）', role: 'button', 'aria-label': '主要顏色', onclick: () => setUI({ activeSlot: 'primary' }) }, h('span', { class: 'swatch-fill', style: { background: colorBg(app.ui.primary) } }));
  const s = h('div', { class: 'swatch-s checker' + (app.ui.activeSlot === 'secondary' ? ' active' : ''), title: '次要顏色（右鍵繪製）', role: 'button', 'aria-label': '次要顏色', onclick: () => setUI({ activeSlot: 'secondary' }) }, h('span', { class: 'swatch-fill', style: { background: colorBg(app.ui.secondary) } }));
  tb.append(h('div', { class: 'colors' }, p, s));
  tb.append(h('button', { class: 'tool', title: '交換顏色 (X)', onclick: swapColors, style: { fontSize: '16px' } }, '⇄'));
  const mini = document.getElementById('mini-color');
  if (mini) mini.style.background = colorBg(app.ui.primary);
}
export function setTool(id) {
  if (!['select', 'lasso', 'move'].includes(id)) dropFloating();
  setUI({ tool: id, prevTool: app.ui.tool !== id ? app.ui.tool : app.ui.prevTool, tempPick: false });
}
export function swapColors() { setUI({ primary: app.ui.secondary, secondary: app.ui.primary }); }

// ---------- options bar ----------
function tog(label, key, title) {
  return h('button', { class: 'tb' + (app.ui[key] ? ' on' : ''), title: title || label, onclick: () => setUI({ [key]: !app.ui[key] }) }, label);
}
export function renderOptions() {
  const ob = document.getElementById('optionsbar');
  ob.innerHTML = '';
  const t = app.ui.tool;
  const add = (...els) => ob.append(...els);
  const sizeCtl = () => {
    const val = h('span', { class: 'val' }, app.ui.brushSize);
    const r = h('input', { type: 'range', min: 1, max: 32, value: app.ui.brushSize, oninput: () => { val.textContent = r.value; app.ui.brushSize = +r.value; emit('canvas'); } });
    return h('label', {}, '筆刷', r, val);
  };
  const shapeCtl = () => h('span', { class: 'grp' },
    h('button', { class: 'tb' + (app.ui.brushShape === 'square' ? ' on' : ''), onclick: () => setUI({ brushShape: 'square' }), title: '方形筆刷' }, '■'),
    h('button', { class: 'tb' + (app.ui.brushShape === 'circle' ? ' on' : ''), onclick: () => setUI({ brushShape: 'circle' }), title: '圓形筆刷' }, '●'),
    app.ui.customBrush ? h('button', { class: 'tb' + (app.ui.brushShape === 'custom' ? ' on' : ''), onclick: () => setUI({ brushShape: 'custom' }), title: '自訂筆刷（由選取範圍建立）' }, '◆') : null);
  const dither = () => {
    const sel = h('select', { onchange: () => setUI({ dither: sel.value }), title: '抖動圖樣筆刷' },
      [['', '無抖動'], ['checker', '棋盤 50%'], ['25', '25%'], ['12', '12%'], ['75', '75%'], ['hlines', '橫線'], ['vlines', '直線']].map(([v, l]) => h('option', { value: v, selected: app.ui.dither === v }, l)));
    return h('label', {}, '抖動', sel);
  };
  const sym = () => h('span', { class: 'grp' }, tog('⇆ 對稱', 'symX', '左右對稱（水平對稱）'), tog('⇅ 對稱', 'symY', '上下對稱（垂直對稱）'));
  if (t === 'pencil' || t === 'eraser') {
    add(sizeCtl(), shapeCtl(), tog('✎ 壓感', 'pressure', 'Apple Pencil 壓力控制筆刷大小（1 ～ 筆刷大小）'));
    if (app.ui.pressure) add(h('label', {}, '門檻', (() => { const s = h('select', { id: 'pressureMin', onchange: () => setUI({ pressureMin: +s.value }), title: '壓力門檻：低於此壓力一律用最小筆刷（防手掌輕觸）' }, [[0, '無'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%']].map(([v, l]) => h('option', { value: v, selected: (app.ui.pressureMin || 0) === v }, l))); return s; })()));
    if (t === 'pencil') add(tog('像素完美', 'pixelPerfect', '去除 L 形轉角（1px 筆刷時有效）'));
    add(dither(), sym(), tog('🔒 鎖定調色盤', 'paletteLock', '只用調色盤顏色：繪圖色自動吸附到最近的調色盤顏色'));
    if (t === 'pencil') add(h('label', {}, '墨水', (() => { const s = h('select', { onchange: () => setUI({ shadeInk: s.value }), title: '色階墨水：在已有顏色上畫＝變暗／變亮一階' }, [['', '正常'], ['dark', '加深'], ['light', '加亮'], ['recolor', '換色（只改已有像素）'], ['behind', '墊底（只畫在空白處）']].map(([v, l]) => h('option', { value: v, selected: (app.ui.shadeInk || '') === v }, l))); return s; })()));
  } else if (t === 'line' || t === 'rect' || t === 'ellipse') {
    add(sizeCtl());
    if (t !== 'line') add(tog('填滿', 'shapeFilled'));
    add(dither(), sym(), h('span', { class: 'small' }, 'Shift：鎖定比例 / 角度'));
  } else if (t === 'fill') {
    add(h('span', { class: 'grp' },
      h('button', { class: 'tb' + (app.ui.fillContiguous ? ' on' : ''), onclick: () => setUI({ fillContiguous: true }) }, '相連區域'),
      h('button', { class: 'tb' + (!app.ui.fillContiguous ? ' on' : ''), onclick: () => setUI({ fillContiguous: false }) }, '全部同色')));
    add(tog('🌗 漸層', 'fillGradient', '拖曳決定方向：主色 → 副色的抖動漸層（點一下＝單色填滿）'));
    add(h('span', { class: 'small' }, '有選取範圍時只填選取內'));
  } else if (t === 'eyedropper') {
    add(h('span', { class: 'grp' },
      h('button', { class: 'tb' + (!app.ui.sampleLayer ? ' on' : ''), onclick: () => setUI({ sampleLayer: false }) }, '取樣：合成畫面'),
      h('button', { class: 'tb' + (app.ui.sampleLayer ? ' on' : ''), onclick: () => setUI({ sampleLayer: true }) }, '取樣：目前圖層')));
  } else if (['select', 'lasso', 'move'].includes(t)) {
    add(...selectionButtons());
    if (t === 'move') add(tog('🔁 環繞移動', 'wrapMove', '移出邊界的像素會從另一側出現（無縫 tile 製作）'));
    if (t === 'move') add(tog('🔗 連動所有圖層', 'linkMove', '移動時同時移動此影格所有可見且未鎖定的圖層'));
  } else if (t === 'hand') {
    add(h('button', { class: 'tb', onclick: fitView }, '符合視窗'));
  }
  add(h('span', { class: 'spacer' }), tog('🤚 左手模式', 'leftHand', '介面左右對調：工具列移到右側、面板移到左側（寬螢幕）'), tog('✍️ 僅筆繪圖', 'penOnly', '防誤觸：開啟後手指只能平移 / 縮放，只有 Apple Pencil / 觸控筆可以繪圖'));
}
function selectionButtons() {
  const b = (label, fn, title) => h('button', { class: 'tb', onclick: fn, title: title || label }, label);
  return [
    b('全選', selectAll, 'Ctrl+A'), b('取消', deselect, 'Ctrl+D'), b('反選', invertSelection, 'Ctrl+Shift+I'),
    b('複製', copySelection, 'Ctrl+C'), b('剪下', cutSelection, 'Ctrl+X'), b('貼上', () => pasteClip(), 'Ctrl+V'), b('刪除', () => deleteSelection(), 'Delete'),
    b('⇆ 翻轉', () => transformSelection('flipH'), '水平翻轉 (Shift+H)'), b('⇅ 翻轉', () => transformSelection('flipV'), '垂直翻轉 (Shift+V)'),
    b('↻ 90°', () => transformSelection('rotCW')), b('↺ 90°', () => transformSelection('rotCCW')),
    b('裁切畫布', A.cropToSelection, '裁切到選取範圍'),
    b('設為筆刷', () => { const cb = customBrushFromSelection(app.selection); if (!app.selection) return toast('請先建立選取範圍'); if (!cb) return toast('選取範圍為空或超過 64×64'); setUI({ customBrush: cb, brushShape: 'custom', tool: 'pencil' }); toast('已建立自訂筆刷（◆）'); }, '把選取範圍的形狀設為筆刷（用目前顏色蓋印）'),
  ];
}
export function renderFloatActions() {
  const el = document.getElementById('float-actions');
  if (!app.floating) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '';
  const b = (label, fn, cls = '') => h('button', { class: 'tb ' + cls, onclick: fn }, label);
  el.append(b('✓ 完成', dropFloating, 'on'), b('✕ 取消', cancelFloating), b('⇆', () => transformSelection('flipH')), b('⇅', () => transformSelection('flipV')), b('↻', () => transformSelection('rotCW')), b('↺', () => transformSelection('rotCCW')), b('🗑', () => deleteSelection()));
}

// ---------- color editor (HSV + alpha + hex) ----------
let hsv = { h: 0, s: 0, v: 0, a: 255 };
let lastColorKey = '';
let origColor = null; // colour before the current slider/hex edit (iter 44, B45)
function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hh = 0;
  if (d) hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((hh * 60) + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToRgb(hh, s, v) {
  const f = (n) => { const k = (n + hh / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return [f(5), f(3), f(1)];
}
const curColor = () => (app.ui.activeSlot === 'secondary' ? app.ui.secondary : app.ui.primary);
export function shade(dir) { setCur(shadeStep(curColor(), dir)); }
function setCur(c) { setUI({ [app.ui.activeSlot === 'secondary' ? 'secondary' : 'primary']: c }); }

let ce = null;
export function renderColorEditor() {
  const root = document.getElementById('color-editor');
  const c = curColor();
  const key = c.join(',') + app.ui.activeSlot;
  if (ce && key === lastColorKey) return;
  lastColorKey = key;
  origColor = null;
  const fromColor = rgbToHsv(c);
  const rgbNow = hsvToRgb(hsv.h, hsv.s, hsv.v);
  if (rgbNow.join() !== c.slice(0, 3).join()) hsv = { ...fromColor, h: fromColor.s === 0 || fromColor.v === 0 ? hsv.h : fromColor.h };
  hsv.a = c[3];
  if (!ce) {
    const sv = h('canvas', { class: 'ce-sv', width: 200, height: 120 });
    const hue = h('canvas', { class: 'ce-bar', width: 200, height: 16 });
    const alpha = h('canvas', { class: 'ce-bar checker', width: 200, height: 16 });
    const hex = h('input', { type: 'text', class: 'ce-hex', maxlength: 9, title: '十六進位色碼 #RRGGBB 或 #RRGGBBAA' });
    const cur = h('div', { class: 'ce-cur checker' }, h('span', { class: 'swatch-fill' }));
    const prev = h('button', { class: 'ce-prev checker', title: '還原為編輯前的顏色', 'aria-label': '還原為編輯前的顏色', style: { display: 'none' }, onclick: () => { if (origColor) { const o = origColor; origColor = null; setCur(o); lastColorKey = [...o].join(',') + app.ui.activeSlot; draw(); } } }, h('span', { class: 'swatch-fill' }));
    const addBtn = h('button', { class: 'sb', title: '加入調色盤', onclick: () => A.addPaletteColor(curColor()) }, '＋色盤');
    hex.addEventListener('change', () => { try { const o = curColor().slice(); setCur(hexToRgba(hex.value)); origColor = o; draw(); } catch { toast('色碼格式錯誤'); } });
    const drag = (el, fn) => {
      const handle = (e) => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); };
      claimPencil(el);
      el.addEventListener('pointerdown', (e) => { capture(el, e.pointerId); if (!origColor) origColor = curColor().slice(); handle(e); el.onpointermove = handle; });
      el.addEventListener('pointerup', () => (el.onpointermove = null));
    };
    const apply = () => { const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v); lastColorKey = [...rgb, hsv.a].join(',') + app.ui.activeSlot; setCur([...rgb, hsv.a]); draw(); };
    drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; apply(); });
    drag(hue, (x) => { hsv.h = x * 359.9; apply(); });
    drag(alpha, (x) => { hsv.a = Math.round(x * 255); apply(); });
    root.append(sv, hue, alpha, h('div', { class: 'ce-row' }, cur, prev, hex, addBtn),
      h('div', { class: 'ce-row' }, h('button', { class: 'sb', title: '較暗一階（快捷鍵 <）', onclick: () => shade(-1) }, '◐ 較暗'), h('button', { class: 'sb', title: '較亮一階（快捷鍵 >）', onclick: () => shade(1) }, '◑ 較亮')));
    ce = { sv, hue, alpha, hex, cur, prev };
  }
  draw();
}
function draw() {
  const { sv, hue, alpha, hex, cur, prev } = ce;
  let g = sv.getContext('2d');
  const [r, gg, b] = hsvToRgb(hsv.h, 1, 1);
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, 200, 120);
  let gr = g.createLinearGradient(0, 0, 200, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 200, 120);
  gr = g.createLinearGradient(0, 0, 0, 120); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 200, 120);
  g.strokeStyle = hsv.v > 0.5 ? '#000' : '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(hsv.s * 200, (1 - hsv.v) * 120, 5, 0, 7); g.stroke();
  g = hue.getContext('2d');
  gr = g.createLinearGradient(0, 0, 200, 0);
  for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 200, 16);
  g.fillStyle = '#fff'; g.fillRect((hsv.h / 360) * 200 - 1.5, 0, 3, 16);
  g = alpha.getContext('2d');
  g.clearRect(0, 0, 200, 16);
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  gr = g.createLinearGradient(0, 0, 200, 0); gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(1, `rgba(${rgb},1)`);
  g.fillStyle = gr; g.fillRect(0, 0, 200, 16);
  g.fillStyle = '#fff'; g.fillRect((hsv.a / 255) * 200 - 1.5, 0, 3, 16);
  const c = curColor();
  if (document.activeElement !== hex) hex.value = rgbaToHex(c, c[3] !== 255);
  cur.firstChild.style.background = colorBg(c);
  const showPrev = !!origColor && origColor.join() !== c.join();
  prev.style.display = showPrev ? '' : 'none';
  if (showPrev) prev.firstChild.style.background = colorBg(origColor);
}

// ---------- palette ----------
let palSel = null;
export function renderPalette() {
  const root = document.getElementById('palette');
  root.innerHTML = '';
  const pal = app.doc.meta.palette;
  const p = rgbaToHex(app.ui.primary), s = rgbaToHex(app.ui.secondary);
  pal.forEach((hex) => {
    const c = hexToRgba(hex);
    const el = h('div', { class: 'pal checker' + (hex === p ? ' sel' : '') + (hex === s ? ' sel2' : ''), title: hex, role: 'button', 'aria-label': `調色盤顏色 ${hex}` }, h('span', { class: 'swatch-fill', style: { background: colorBg(c) } }));
    let lp = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      lp = setTimeout(() => { lp = 'fired'; swatchMenu(el, hex); }, 550);
    });
    el.addEventListener('pointerup', () => { if (lp !== 'fired') { clearTimeout(lp); setCur(c); palSel = hex; } lp = null; });
    el.addEventListener('pointerleave', () => { if (lp && lp !== 'fired') clearTimeout(lp); lp = null; });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); swatchMenu(el, hex); });
    root.append(el);
  });
  const acts = document.getElementById('palette-actions');
  acts.innerHTML = '';
  acts.append(
    h('button', { class: 'sb', title: '把目前顏色加入調色盤', onclick: () => A.addPaletteColor(curColor()) }, '＋'),
    h('button', { class: 'sb', title: '移除選取的顏色', onclick: () => { const hex = palSel || rgbaToHex(curColor()); if (pal.includes(hex)) A.removePaletteColor(hex); else toast('先點選要移除的色塊'); } }, '−'),
    h('button', { class: 'sb', title: '調色盤選單', onclick: (e) => paletteMenu(e.currentTarget) }, '▾'),
  );
}
function swatchMenu(el, hex) {
  popupMenu(el, [
    { label: '設為主要顏色', action: () => setUI({ primary: hexToRgba(hex) }) },
    { label: '設為次要顏色', action: () => setUI({ secondary: hexToRgba(hex) }) },
    { label: '以目前顏色取代', action: () => A.setPalette(app.doc.meta.palette.map((c) => (c === hex ? rgbaToHex(curColor()) : c)), '修改顏色') },
    { label: '從調色盤移除', action: () => A.removePaletteColor(hex) },
  ]);
}
function paletteMenu(anchor) {
  popupMenu(anchor, [
    { header: '載入預設調色盤' },
    ...Object.values(PALETTES).map((p) => ({ label: `${p.name}（${p.colors.length} 色）`, action: () => A.setPalette(p.colors.slice(), `調色盤：${p.name}`) })),
    '-',
    { label: '以目前顏色加入色階（7 色，含色相偏移）', action: addRamp },
    { label: '從畫面擷取所有顏色', action: extractPalette },
    { label: '匯入 .hex / .gpl…', action: importPalette },
    { label: '匯出 .hex', action: () => download(new Blob([paletteToHex(app.doc.meta.palette)], { type: 'text/plain' }), `${app.doc.meta.name}.hex`) },
    { label: '匯出 .gpl（GIMP / Aseprite）', action: () => download(new Blob([paletteToGpl(app.doc.meta.palette, app.doc.meta.name)], { type: 'text/plain' }), `${app.doc.meta.name}.gpl`) },
    { label: '清空調色盤', action: () => A.setPalette([], '清空調色盤') },
  ]);
}
async function importPalette() {
  const f = await pickFile('.hex,.gpl,.txt');
  if (!f) return;
  const cols = parsePaletteFile(await readAs(f), f.name);
  if (!cols.length) return toast('檔案中找不到顏色');
  A.setPalette(cols, '匯入調色盤');
  toast(`已匯入 ${cols.length} 色`);
}
function addRamp() {
  const ramp = makeRamp(rgbaToHex(curColor()).slice(0, 7), 7);
  const have = new Set(app.doc.meta.palette);
  const add = ramp.filter((c) => !have.has(c));
  if (!add.length) return toast('色階已在調色盤中');
  A.setPalette([...app.doc.meta.palette, ...add], '加入色階');
  toast(`已加入 ${add.length} 個色階顏色`);
}
function extractPalette() {
  const set = new Set(app.doc.meta.palette);
  for (const b of app.doc.cels.values()) for (let i = 0; i < b.length; i += 4) if (b[i + 3]) set.add(rgbaToHex([b[i], b[i + 1], b[i + 2], b[i + 3]]));
  if (set.size > 256) return toast('顏色超過 256 種，未擷取');
  A.setPalette([...set], '擷取畫面顏色');
}

// ---------- timeline ----------
// touch devices get 44pt cels / rows / layer buttons (ADR-002)
const isTouchUI = () => document.documentElement.classList.contains('touch');
const LH_W = () => (window.innerWidth <= 760 ? (isTouchUI() ? 168 : 150) : (isTouchUI() ? 204 : 190));
let CW = 36;
export function renderTimeline() {
  renderTimelineControls();
  const grid = document.getElementById('tl-grid');
  const m = app.doc.meta;
  const nF = m.frames.length;
  grid.innerHTML = '';
  CW = isTouchUI() ? 44 : 36;
  grid.style.gridTemplateColumns = `${LH_W()}px repeat(${nF}, ${CW}px)`;
  // tags row
  grid.append(h('div', { class: 'tl-tagcorner small', style: { height: '18px', padding: '0 6px', lineHeight: '18px' } }, '標籤'));
  const tagRow = h('div', { class: 'tl-tags', style: { gridColumn: `2 / span ${nF}` } });
  for (const t of m.tags) {
    tagRow.append(h('div', {
      class: 'tl-tag', title: `${t.name}（${t.from + 1}–${t.to + 1}，${dirLabel(t.direction)}）`,
      style: { left: t.from * CW + 1 + 'px', width: (t.to - t.from + 1) * CW - 2 + 'px', background: t.color || '#5b6ee1', outline: app.ui.playTag === t.id ? '2px solid #fff' : '' },
      onclick: () => tagDialog(t),
    }, t.name));
  }
  grid.append(tagRow);
  // frame header
  grid.append(h('div', { class: 'tl-corner small', style: { height: isTouchUI() ? '44px' : '34px', display: 'flex', alignItems: 'center', padding: '0 6px', position: 'sticky', top: 0, zIndex: 4 } }, `圖層 ${m.layers.length} · 影格 ${nF}`));
  const sel = app.ui.frameSel;
  m.frames.forEach((f, i) => {
    const el = h('div', { class: 'tl-fh' + (i === app.ui.frame ? ' cur' : '') + (sel && i >= sel[0] && i <= sel[1] ? ' insel' : ''), title: `影格 ${i + 1}，${f.duration}ms（雙擊修改時長，Shift+點選選取範圍）` },
      h('div', {}, i + 1), h('div', { class: 'dur' }, f.duration + 'ms'));
    el.addEventListener('click', (e) => {
      if (e.shiftKey) { const a = Math.min(app.ui.frame, i), b = Math.max(app.ui.frame, i); app.ui.frameSel = [a, b]; renderTimeline(); return; }
      app.ui.frameSel = null;
      A.selectFrame(i);
    });
    el.addEventListener('dblclick', () => editDuration(i));
    let lp; el.addEventListener('pointerdown', () => { lp = setTimeout(() => editDuration(i), 600); });
    el.addEventListener('pointerup', () => clearTimeout(lp)); el.addEventListener('pointerleave', () => clearTimeout(lp));
    grid.append(el);
  });
  // layers (top first)
  for (let r = m.layers.length - 1; r >= 0; r--) {
    const L = m.layers[r];
    const isCur = L.id === app.ui.layerId;
    const lh = h('div', { class: 'tl-lh' + (isCur ? ' cur' : ''), 'data-layer': L.id, style: { width: LH_W() + 'px' } },
      h('span', { class: 'grip', title: '拖曳調整順序' }, '⋮⋮'),
      h('button', { class: 'tiny' + (L.visible ? '' : ' off'), title: '顯示 / 隱藏', onclick: (e) => { e.stopPropagation(); A.updateLayer(L.id, { visible: !L.visible }, L.visible ? '隱藏圖層' : '顯示圖層'); } }, '👁'),
      h('button', { class: 'tiny alock' + (L.alphaLock ? '' : ' off'), title: 'α 鎖：只改已有像素的顏色', 'aria-label': '鎖定透明度', onclick: (e) => { e.stopPropagation(); A.updateLayer(L.id, { alphaLock: !L.alphaLock }, L.alphaLock ? '解除鎖定透明度' : '鎖定透明度'); } }, 'α'),
      h('button', { class: 'tiny' + (L.locked ? '' : ' off'), title: '鎖定（鎖定後 AI 也無法寫入）', onclick: (e) => { e.stopPropagation(); A.updateLayer(L.id, { locked: !L.locked }, L.locked ? '解鎖圖層' : '鎖定圖層'); } }, L.locked ? '🔒' : '🔓'),
      h('span', { class: 'nm', title: `${L.name}（${Math.round(L.opacity * 100)}% · ${blendLabel(L.blend)}）雙擊編輯` }, L.name + (L.opacity < 1 ? ` ${Math.round(L.opacity * 100)}%` : '') + (L.blend !== 'normal' ? ' ✱' : '')));
    lh.addEventListener('click', () => A.selectLayer(L.id));
    lh.querySelector('.nm').addEventListener('dblclick', () => layerDialog(L));
    bindLayerDrag(lh.querySelector('.grip'), L);
    grid.append(lh);
    m.frames.forEach((f, i) => {
      const has = app.doc.cels.has(celKey(L.id, f.id));
      const cel = h('div', { class: 'tl-cel' + (i === app.ui.frame ? (isCur ? ' cur' : ' curf') : '') }, h('span', { class: 'c' + (has ? ' full' : '') }));
      cel.addEventListener('click', () => { dropFloating(); app.ui.layerId = L.id; A.selectFrame(i); });
      grid.append(cel);
    });
  }
  // keep current frame visible
  const scroll = document.getElementById('tl-scroll');
  scroll.style.scrollPaddingLeft = LH_W() + 'px'; // sticky layer column must not cover a cel scrolled into view
  const x = LH_W() + app.ui.frame * CW;
  if (x < scroll.scrollLeft + LH_W() || x + CW > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = Math.max(0, x - LH_W() - 40);
}
const dirLabel = (d) => ({ forward: '正向', reverse: '反向', pingpong: '來回' }[d] || d);
const blendLabel = (b) => ({ normal: '一般', multiply: '色彩增值', screen: '濾色', overlay: '覆蓋' }[b] || b);

function bindLayerDrag(grip, L) {
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    capture(grip, e.pointerId);
    let target = null;
    const rows = [...document.querySelectorAll('.tl-lh')];
    const mv = (ev) => {
      rows.forEach((r) => r.classList.remove('drag-over'));
      target = rows.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; });
      target?.classList.add('drag-over');
    };
    const upH = () => {
      grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', upH);
      rows.forEach((r) => r.classList.remove('drag-over'));
      if (target) {
        const toId = target.dataset.layer;
        if (toId !== L.id) A.moveLayer(L.id, app.doc.meta.layers.findIndex((l) => l.id === toId));
      }
    };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', upH);
  });
}

async function editDuration(i) {
  const v = await prompt('影格時長（毫秒）', String(app.doc.meta.frames[i].duration), app.ui.frameSel ? `套用到選取的影格 ${app.ui.frameSel[0] + 1}–${app.ui.frameSel[1] + 1}` : `影格 ${i + 1}`);
  if (v === null || v === undefined) return;
  const ms = parseInt(v, 10);
  if (!(ms > 0)) return toast('請輸入正整數');
  const idx = app.ui.frameSel ? Array.from({ length: app.ui.frameSel[1] - app.ui.frameSel[0] + 1 }, (_, k) => app.ui.frameSel[0] + k) : [i];
  A.setFrameDuration(idx, ms);
}

function renderTimelineControls() {
  const c = document.getElementById('tl-controls');
  c.innerHTML = '';
  const m = app.doc.meta;
  const b = (label, fn, title, cls = '') => h('button', { class: 'ib ' + cls, style: { fontSize: '15px' }, title, onclick: fn }, label);
  const loopSel = h('select', { title: '播放模式', onchange: () => setUI({ loopMode: loopSel.value }) },
    [['loop', '🔁 循環'], ['pingpong', '↔ 來回'], ['once', '→ 單次']].map(([v, l]) => h('option', { value: v, selected: app.ui.loopMode === v }, l)));
  const tagSel = h('select', { title: '播放範圍', onchange: () => { setUI({ playTag: tagSel.value }); renderTimeline(); } },
    h('option', { value: '' }, '全部影格'), m.tags.map((t) => h('option', { value: t.id, selected: app.ui.playTag === t.id }, '🏷 ' + t.name)));
  const fps = h('input', { type: 'number', min: 1, max: 60, value: Math.round(1000 / (m.frames[app.ui.frame]?.duration || 100)), title: 'FPS', style: { width: '52px' } });
  c.append(
    b(app.ui.playing ? '⏸' : '▶', () => emit('togglePlay'), '播放 / 暫停 (Enter)', app.ui.playing ? 'on' : ''),
    b('⏮', () => A.selectFrame(app.ui.frame - 1), '上一格 (,)'),
    b('⏭', () => A.selectFrame(app.ui.frame + 1), '下一格 (.)'),
    loopSel, tagSel,
    h('label', { class: 'small', style: { display: 'inline-flex', alignItems: 'center', gap: '3px' } }, 'FPS', fps,
      h('button', { class: 'sb', onclick: () => { const v = Math.max(1, Math.min(60, +fps.value || 10)); A.setFrameDuration(m.frames.map((_, i) => i), Math.round(1000 / v)); }, title: '以此 FPS 設定所有影格的時長' }, '套用全部')),
    h('div', { class: 'sep' }),
    b('＋格', () => A.addFrame(false), '新增空白影格 (Alt+N)'),
    b('複製格', () => A.addFrame(true), '複製目前影格 (Alt+D)'),
    b('🗑格', () => A.deleteFrame(), '刪除目前影格'),
    b('←移', () => A.moveFrame(-1), '影格往前移'),
    b('移→', () => A.moveFrame(1), '影格往後移'),
    b('🏷', () => tagDialog(null), '新增標籤（Shift+點影格可先選範圍）'),
    b('🧅', () => setUI({ onion: { ...app.ui.onion, on: !app.ui.onion.on } }), '洋蔥皮 (F3)', app.ui.onion.on ? 'on' : ''),
    h('div', { class: 'sep' }),
    b('＋層', A.addLayer, '新增圖層 (Shift+N)'),
    b('複製層', A.duplicateLayer, '複製圖層'),
    b('🗑層', () => A.deleteLayer(), '刪除圖層'),
    b('⤓', A.mergeDown, '向下合併 (Ctrl+E)'),
    b('⚙', () => layerDialog(activeLayer()), '圖層屬性'),
    b('⌫', A.clearCel, '清除目前 cel'),
  );
}

function layerDialog(L) {
  const name = h('input', { type: 'text', value: L.name });
  const op = h('input', { type: 'range', min: 0, max: 100, value: Math.round(L.opacity * 100) });
  const opv = h('span', { class: 'small' }, Math.round(L.opacity * 100) + '%');
  op.oninput = () => (opv.textContent = op.value + '%');
  const blend = h('select', {}, ['normal', 'multiply', 'screen', 'overlay'].map((b) => h('option', { value: b, selected: L.blend === b }, blendLabel(b))));
  modal({
    title: '圖層屬性',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, '名稱'), name), h('div', { class: 'field' }, h('span', {}, '不透明度'), h('div', { class: 'row' }, op, opv)), h('label', { class: 'field' }, h('span', {}, '混合模式'), blend)),
    buttons: [{ label: '取消', value: null }, { label: '套用', class: 'primary', onClick: () => A.updateLayer(L.id, { name: name.value.trim() || L.name, opacity: +op.value / 100, blend: blend.value }) }],
  });
}

function tagDialog(tag) {
  const m = app.doc.meta;
  const sel = app.ui.frameSel || [app.ui.frame, app.ui.frame];
  const t = tag || { name: `標籤 ${m.tags.length + 1}`, from: sel[0], to: sel[1], direction: 'forward', color: '#5b6ee1' };
  const name = h('input', { type: 'text', value: t.name });
  const from = h('input', { type: 'number', min: 1, max: m.frames.length, value: t.from + 1 });
  const to = h('input', { type: 'number', min: 1, max: m.frames.length, value: t.to + 1 });
  const dir = h('select', {}, ['forward', 'reverse', 'pingpong'].map((d) => h('option', { value: d, selected: t.direction === d }, dirLabel(d))));
  const color = h('input', { type: 'color', value: (t.color || '#5b6ee1').slice(0, 7) });
  const buttons = [{ label: '取消', value: null }];
  if (tag) {
    buttons.unshift({ label: '刪除', class: 'danger', onClick: () => A.deleteTag(tag.id) });
    buttons.splice(1, 0, { label: app.ui.playTag === tag.id ? '取消播放範圍' : '設為播放範圍', onClick: () => { setUI({ playTag: app.ui.playTag === tag.id ? '' : tag.id }); renderTimeline(); } });
  }
  buttons.push({ label: '儲存', class: 'primary', onClick: () => {
    const a = Math.max(1, Math.min(m.frames.length, +from.value)) - 1, b = Math.max(1, Math.min(m.frames.length, +to.value)) - 1;
    A.saveTag({ ...(tag ? { id: tag.id } : {}), name: name.value.trim() || '標籤', from: Math.min(a, b), to: Math.max(a, b), direction: dir.value, color: color.value });
  } });
  modal({
    title: tag ? '編輯標籤' : '新增標籤',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, '名稱（例如 idle、walk、attack）'), name),
      h('div', { class: 'row' }, h('label', {}, '從影格'), from, h('label', {}, '到'), to),
      h('div', { class: 'row' }, h('label', {}, '方向'), dir, h('label', {}, '顏色'), color)),
    buttons,
  });
}

// ---------- onion skin ----------
export function renderOnion() {
  const root = document.getElementById('onion');
  const o = app.ui.onion;
  root.innerHTML = '';
  const set = (p) => setUI({ onion: { ...app.ui.onion, ...p } });
  const num = (v, fn) => h('input', { type: 'number', min: 0, max: 10, value: v, style: { width: '52px' }, onchange: (e) => fn(Math.max(0, Math.min(10, +e.target.value || 0))) });
  root.append(
    h('div', { class: 'row' }, h('label', {}, h('input', { type: 'checkbox', checked: o.on, onchange: (e) => set({ on: e.target.checked }) }), ' 啟用 (F3)'),
      h('label', {}, h('input', { type: 'checkbox', checked: o.tint, onchange: (e) => set({ tint: e.target.checked }) }), ' 色調')),
    h('div', { class: 'row' }, h('label', {}, '前'), num(o.prev, (v) => set({ prev: v })), h('input', { type: 'color', value: o.prevColor, title: '過去影格色調', onchange: (e) => set({ prevColor: e.target.value }) }),
      h('label', {}, '後'), num(o.next, (v) => set({ next: v })), h('input', { type: 'color', value: o.nextColor, title: '未來影格色調', onchange: (e) => set({ nextColor: e.target.value }) })),
    slider('不透明', 0.05, 1, 0.05, o.opacity, (v) => { app.ui.onion.opacity = v; emit('canvas'); }, (v) => Math.round(v * 100) + '%'),
  );
}

// ---------- references ----------
export function renderRefs() {
  const root = document.getElementById('refs');
  root.innerHTML = '';
  const refs = app.doc.meta.references || [];
  root.append(h('div', { class: 'row' }, h('label', {}, h('input', { type: 'checkbox', checked: app.ui.refsAbove, onchange: (e) => setUI({ refsAbove: e.target.checked }) }), ' 顯示在畫布上方')));
  if (!refs.length) root.append(h('div', { class: 'small' }, '匯入設計稿 / 參考圖，可調透明度描圖。參考圖不會被匯出；連上伺服器時 AI 可讀取（reference:read）。'));
  for (const r of refs) {
    const numIn = (k, step, w = '58px') => h('input', { type: 'number', step, value: r[k] ?? 0, style: { width: w }, onchange: (e) => A.updateReference(r.id, { [k]: +e.target.value }) });
    root.append(h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '4px', marginTop: '4px' } },
      h('div', { class: 'row' },
        h('input', { type: 'checkbox', checked: r.visible, title: '顯示', onchange: (e) => A.updateReference(r.id, { visible: e.target.checked }) }),
        h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
        h('button', { class: 'sb', title: '刪除參考圖', onclick: () => A.deleteReference(r.id) }, '🗑')),
      slider('透明', 0.05, 1, 0.05, r.opacity, (v, done) => { r.opacity = v; emit('canvas'); if (done) A.updateReference(r.id, { opacity: v }); }, (v) => Math.round(v * 100) + '%'),
      h('div', { class: 'row' }, h('label', {}, 'X'), numIn('x', 1, '52px'), h('label', {}, 'Y'), numIn('y', 1, '52px'), h('label', {}, '縮放'), numIn('scale', 0.05, '62px')),
      h('div', { class: 'row' }, h('label', {}, h('input', { type: 'checkbox', checked: !!r.pixelated, onchange: (e) => A.updateReference(r.id, { pixelated: e.target.checked }) }), ' 像素化顯示'))));
  }
}

// ---------- history ----------
export function renderHistory() {
  const root = document.getElementById('history');
  root.innerHTML = '';
  const { undo: U, redo: R } = app.history;
  root.append(h('div', { class: 'hist-item' + (U.length === 0 ? ' cur' : ''), onclick: () => jumpHistory(0) }, '◦ 開啟專案'));
  U.forEach((e, i) => root.append(h('div', { class: 'hist-item' + (e.kind === 'ai' ? ' ai' : '') + (i === U.length - 1 ? ' cur' : ''), title: new Date(e.time).toLocaleTimeString(), onclick: () => jumpHistory(i + 1) }, e.label)));
  [...R].reverse().forEach((e, i) => root.append(h('div', { class: 'hist-item future' + (e.kind === 'ai' ? ' ai' : ''), onclick: () => jumpHistory(U.length + i + 1) }, e.label)));
  const mb = (b) => (b / 1048576).toFixed(1);
  const hb = historyBytes();
  root.append(h('div', { class: 'hist-mem small', id: 'hist-mem' }, `${U.length} 步 · 復原記憶體 ${mb(hb)} / ${mb(app.history.budget)} MB` + (app.history.trimmed ? ` · 已移除最舊 ${app.history.trimmed} 步` : '')));
  root.scrollTop = root.scrollHeight;
  document.getElementById('btn-undo').disabled = !U.length;
  document.getElementById('btn-redo').disabled = !R.length;
  document.getElementById('fp-undo').disabled = !U.length;
  document.getElementById('fp-redo').disabled = !R.length;
}

// ---------- preview ----------
let pvSrc = null, pvMark = null;
document.addEventListener('ps-hover', (e) => { pvMark = e.detail; if (pvSrc) renderPreview(pvSrc); });
export function renderPreview(src) {
  pvSrc = src;
  const pv = document.getElementById('preview');
  if (!pv.offsetParent) return;
  const r = pv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (pv.width !== Math.round(r.width * dpr)) { pv.width = Math.round(r.width * dpr); pv.height = Math.round(r.height * dpr); }
  const g = pv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, pv.width, pv.height);
  const fit = Math.min(pv.width / src.width, pv.height / src.height);
  const s = fit >= 1 ? Math.floor(fit) : fit;
  const w = src.width * s, hh = src.height * s;
  const ox = (pv.width - w) / 2, oy = (pv.height - hh) / 2;
  g.drawImage(src, ox, oy, w, hh);
  // B42: mark the pixel under the cursor so the preview shows where you are drawing
  if (pvMark && pvMark.x >= 0 && pvMark.y >= 0 && pvMark.x < src.width && pvMark.y < src.height) {
    const mx = ox + pvMark.x * s, my = oy + pvMark.y * s, m = Math.max(s, 3 * dpr);
    const cx = mx + s / 2 - m / 2, cy = my + s / 2 - m / 2;
    g.lineWidth = Math.max(1, dpr);
    g.strokeStyle = '#000'; g.strokeRect(cx - 1, cy - 1, m + 2, m + 2);
    g.strokeStyle = '#fff'; g.strokeRect(cx, cy, m, m);
    pv.dataset.mark = `${pvMark.x},${pvMark.y}`;
  } else delete pv.dataset.mark;
}
