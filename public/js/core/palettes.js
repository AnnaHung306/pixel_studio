// Built-in palettes (hex without alpha → stored as #RRGGBBFF)
const toFull = (arr) => arr.map((h) => ('#' + h.replace('#', '') + 'ff').toLowerCase());

export const PALETTES = {
  db32: {
    name: 'DawnBringer 32',
    colors: toFull(['000000', '222034', '45283c', '663931', '8f563b', 'df7126', 'd9a066', 'eec39a', 'fbf236', '99e550', '6abe30', '37946e', '4b692f', '524b24', '323c39', '3f3f74', '306082', '5b6ee1', '639bff', '5fcde4', 'cbdbfc', 'ffffff', '9badb7', '847e87', '696a6a', '595652', '76428a', 'ac3232', 'd95763', 'd77bba', '8f974a', '8a6f30']),
  },
  pico8: {
    name: 'PICO-8',
    colors: toFull(['000000', '1d2b53', '7e2553', '008751', 'ab5236', '5f574f', 'c2c3c7', 'fff1e8', 'ff004d', 'ffa300', 'ffec27', '00e436', '29adff', '83769c', 'ff77a8', 'ffccaa']),
  },
  gameboy: { name: 'Game Boy', colors: toFull(['0f380f', '306230', '8bac0f', '9bbc0f']) },
  endesga32: {
    name: 'Endesga 32',
    colors: toFull(['be4a2f', 'd77643', 'ead4aa', 'e4a672', 'b86f50', '733e39', '3e2731', 'a22633', 'e43b44', 'f77622', 'feae34', 'fee761', '63c74d', '3e8948', '265c42', '193c3e', '124e89', '0099db', '2ce8f5', 'ffffff', 'c0cbdc', '8b9bb4', '5a6988', '3a4466', '262b44', '181425', 'ff0044', '68386c', 'b55088', 'f6757a', 'e8b796', 'c28569']),
  },
};

export const DEFAULT_PALETTE = PALETTES.db32.colors;

export function parsePaletteFile(text, filename = '') {
  const colors = [];
  const lower = filename.toLowerCase();
  if (lower.endsWith('.gpl') || /^GIMP Palette/m.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/);
      if (m) colors.push('#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') + 'ff');
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
      if (m) colors.push('#' + m[1].toLowerCase() + (m[2] || 'ff').toLowerCase());
    }
  }
  return colors;
}

// Names (B51): GPL lines "r g b<TAB>name". Returns {hex:name}; auto "#rrggbb"-style labels are skipped.
export function parsePaletteNames(text) {
  const names = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const nm = m[4].trim();
    if (!nm || /^#?[0-9a-fA-F]{6}$/.test(nm) || /^Untitled$/i.test(nm)) continue;
    names['#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') + 'ff'] = nm.slice(0, 40);
  }
  return names;
}

export function paletteToHex(colors) {
  return colors.map((c) => c.replace('#', '').slice(0, 6)).join('\n') + '\n';
}

export function paletteToGpl(colors, name = 'Pixel Studio', names = {}) {
  const lines = ['GIMP Palette', `Name: ${name}`, 'Columns: 8', '#'];
  for (const c of colors) {
    const h = c.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${(names && names[c]) || h.slice(0, 6)}`);
  }
  return lines.join('\n') + '\n';
}

// Shade step (B18 part 2): next darker (dir<0) or lighter (dir>0) color along a hue-shifted ramp. rgba array in/out.
export function shadeStep(rgba, dir) {
  const hex = '#' + [0, 1, 2].map((i) => rgba[i].toString(16).padStart(2, '0')).join('');
  const r = makeRamp(hex, 9), mid = 4, c = r[mid + (dir < 0 ? -1 : 1)];
  const out = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const same = out.every((v, i) => v === rgba[i]);
  return same ? rgba.slice() : [...out, rgba[3]];
}

// Shading ramp (B18): n colors dark→light around `hex`, with hue shift (shadows toward blue/purple, highlights toward yellow).
export function makeRamp(hex, n = 7) {
  n = Math.max(3, Math.min(15, n | 0));
  const h6 = String(hex).replace('#', '');
  const r = parseInt(h6.slice(0, 2), 16) / 255, g = parseInt(h6.slice(2, 4), 16) / 255, b = parseInt(h6.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let H = 0;
  if (d) H = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  H *= 60;
  const L0 = (mx + mn) / 2, S0 = d ? d / (1 - Math.abs(2 * L0 - 1)) : 0;
  const mid = (n - 1) / 2, out = [];
  for (let i = 0; i < n; i++) {
    const t = (i - mid) / mid; // -1 dark … +1 light
    const L = Math.min(0.95, Math.max(0.06, L0 + t * (t < 0 ? L0 - 0.08 : 0.93 - L0) * 0.9));
    const S = Math.min(1, Math.max(0, S0 * (1 - 0.25 * Math.abs(t)) + (S0 ? 0 : 0)));
    const hh = (H + (t < 0 ? 1 : -1) * Math.abs(t) * 20 + 360) % 360;
    const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = L - c / 2;
    const [rr, gg, bb] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    const f = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    out.push('#' + f(rr) + f(gg) + f(bb) + 'ff');
  }
  out[(n - 1) >> 1] = '#' + h6.slice(0, 6).toLowerCase() + 'ff';
  return out;
}

// Palette lock (iter 26): nearest palette color to rgba (weighted RGB distance). Alpha is kept. Empty palette → same color.
export function nearestPaletteColor(rgba, palette) {
  if (!palette || !palette.length) return rgba.slice();
  let best = null, bd = Infinity;
  for (const hx of palette) {
    const v = [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
    if (v.some(Number.isNaN)) continue;
    const rm = (v[0] + rgba[0]) / 2, dr = v[0] - rgba[0], dg = v[1] - rgba[1], db = v[2] - rgba[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) { bd = d; best = v; }
  }
  return best ? [...best, rgba[3]] : rgba.slice();
}
