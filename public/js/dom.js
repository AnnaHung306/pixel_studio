// Tiny DOM helpers: element builder, modal dialogs, popup menu, downloads.

// iOS / iPadOS detection (iPadOS 13+ reports itself as "Macintosh" but has touch points).
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// setPointerCapture throws (NotFoundError / InvalidStateError) when the pointer is no longer active,
// e.g. a very fast tap on iOS where pointerup/pointercancel already ran, or synthetic events.
export function capture(el, pointerId) {
  try { el.setPointerCapture(pointerId); } catch {}
}
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export function modal({ title, body, buttons = [], wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  let resolveFn;
  const p = new Promise((r) => (resolveFn = r));
  let closed = false;
  const close = (val) => { if (closed) return; closed = true; bd.remove(); document.removeEventListener('keydown', esc, true); onClose?.(); resolveFn(val); };
  // if the dialog was removed some other way, never keep swallowing Escape for the rest of the app
  const esc = (e) => { if (!bd.isConnected) { close(null); return; } if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
  const footer = buttons.length ? h('footer', {}, buttons.map((b) => h('button', { class: 'btn ' + (b.class || ''), onclick: async () => { const v = b.onClick ? await b.onClick() : b.value; if (v !== false) close(v ?? b.value ?? true); } }, b.label))) : null;
  const m = h('div', { class: 'modal' + (wide ? ' wide' : '') }, h('header', {}, title, h('button', { class: 'ib x', onclick: () => close(null) }, '✕')), h('div', { class: 'body' }, body), footer);
  const bd = h('div', { class: 'backdrop', onpointerdown: (e) => { if (e.target === bd) close(null); } }, m);
  root.append(bd);
  document.addEventListener('keydown', esc, true);
  setTimeout(() => m.querySelector('input:not([type=checkbox]):not([type=range]),select')?.focus(), 30);
  return { promise: p, close, el: m };
}

export function prompt(title, value = '', label = '') {
  const inp = h('input', { type: 'text', value });
  const d = modal({
    title,
    body: h('div', {}, label ? h('div', { class: 'small' }, label) : null, inp),
    buttons: [{ label: '取消', value: null }, { label: '確定', class: 'primary', onClick: () => inp.value }],
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { d.close(inp.value); } });
  return d.promise;
}
export function confirmBox(title, text, okLabel = '確定', danger = false) {
  return modal({ title, body: h('p', {}, text), buttons: [{ label: '取消', value: false }, { label: okLabel, class: danger ? 'danger' : 'primary', value: true }] }).promise;
}

let menuCleanup = null;
export function popupMenu(anchor, items) {
  const menu = document.getElementById('menu');
  closeMenu();
  menu.innerHTML = '';
  for (const it of items) {
    if (it === '-') { menu.append(h('div', { class: 'mi-sep' })); continue; }
    if (it.header) { menu.append(h('div', { class: 'mi-h' }, it.header)); continue; }
    menu.append(h('div', { class: 'mi', onclick: () => { closeMenu(); it.action(); } }, h('span', {}, it.label), it.key ? h('span', { class: 'k' }, it.key) : null));
  }
  menu.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const mw = Math.min(280, window.innerWidth - 16);
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 100) + 'px';
  menu.style.maxHeight = (window.innerHeight - Math.min(r.bottom + 4, window.innerHeight - 100) - 12) + 'px';
  const off = (e) => { if (!menu.contains(e.target) && e.target !== anchor) closeMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', off), 0);
  menuCleanup = () => document.removeEventListener('pointerdown', off);
}
export function closeMenu() {
  document.getElementById('menu').classList.add('hidden');
  menuCleanup?.(); menuCleanup = null;
}

export function download(blob, filename) {
  // iOS Home-Screen (standalone) web apps have no download UI for blob links; hand the file to the share
  // sheet instead ("儲存到檔案" / "儲存影像"). Falls back to a normal download if sharing is refused.
  if (isIOS && navigator.standalone && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch((e) => { if (e?.name !== 'AbortError') linkDownload(blob, filename); });
      return;
    }
  }
  linkDownload(blob, filename);
}
function linkDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const inp = document.getElementById('file-input');
    inp.value = '';
    // iOS / iPadOS greys out files whose extension it cannot map to a known type (.pxs, .gpl, .hex),
    // so there we accept any file and validate the content after it is picked.
    inp.accept = isIOS && /(^|,)\s*\.(pxs|gpl|hex|json|txt)\b/i.test(accept) ? '' : accept;
    inp.multiple = multiple;
    inp.onchange = () => resolve(multiple ? [...inp.files] : inp.files[0] || null);
    inp.oncancel = () => resolve(multiple ? [] : null);
    inp.click();
  });
}

export function readAs(file, kind = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (kind === 'text') r.readAsText(file);
    else if (kind === 'dataurl') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}

export function slider(label, min, max, step, value, onInput, fmt = (v) => v) {
  const val = h('span', { class: 'small', style: { minWidth: '36px', textAlign: 'right' } }, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value, oninput: () => { val.textContent = fmt(+inp.value); onInput(+inp.value, false); }, onchange: () => onInput(+inp.value, true) });
  return h('div', { class: 'row' }, h('label', {}, label), inp, val);
}
