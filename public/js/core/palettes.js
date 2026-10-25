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

export function paletteToHex(colors) {
  return colors.map((c) => c.replace('#', '').slice(0, 6)).join('\n') + '\n';
}

export function paletteToGpl(colors, name = 'Pixel Studio') {
  const lines = ['GIMP Palette', `Name: ${name}`, 'Columns: 8', '#'];
  for (const c of colors) {
    const h = c.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${h.slice(0, 6)}`);
  }
  return lines.join('\n') + '\n';
}
