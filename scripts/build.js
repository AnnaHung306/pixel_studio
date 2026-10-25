// Build: copy public/ → dist/, generate PWA icons and stamp the service worker with the asset list.
// No bundler needed — the frontend is plain ES modules that run directly in modern browsers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');

// ---- icons (pixel-art brush, generated so the repo stays binary-free) ----
const ICON = [
  '................',
  '...........###..',
  '..........#ccc#.',
  '.........#cccc#.',
  '........#cccc#..',
  '.......#cccc#...',
  '......#yyyy#....',
  '.....#yyyy#.....',
  '....#wwww#......',
  '...#pppw#.......',
  '..#pppp#........',
  '..#ppp#.........',
  '.#ppp#..........',
  '.#pp#...........',
  '.##.............',
  '................',
];
const COLORS = { '#': [20, 20, 30], c: [91, 140, 255], y: [254, 231, 97], w: [234, 212, 170], p: [255, 0, 77] };
function makeIcon(size, pad, bg = [27, 27, 36]) {
  const png = new PNG({ width: size, height: size });
  const inner = size - pad * 2, cell = Math.floor(inner / 16), off = Math.floor((size - cell * 16) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    let c = bg;
    const cx = Math.floor((x - off) / cell), cy = Math.floor((y - off) / cell);
    if (cx >= 0 && cy >= 0 && cx < 16 && cy < 16) { const ch = ICON[cy][cx]; if (COLORS[ch]) c = COLORS[ch]; }
    png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
const iconDir = path.join(SRC, 'icons');
fs.mkdirSync(iconDir, { recursive: true });
const wIcon = (n, s, p) => { const f = path.join(iconDir, n); if (!fs.existsSync(f)) fs.writeFileSync(f, makeIcon(s, p)); };
wIcon('icon-192.png', 192, 16);
wIcon('icon-512.png', 512, 40);
wIcon('icon-512-maskable.png', 512, 100);
wIcon('apple-touch-icon.png', 180, 14);

// ---- copy ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const assets = [];
const hash = crypto.createHash('sha1');
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (!p.endsWith('sw.js')) { const rel = path.relative(OUT, p).split(path.sep).join('/'); assets.push('./' + rel); hash.update(fs.readFileSync(p)); }
  }
})(OUT);
assets.push('./');
const version = hash.digest('hex').slice(0, 10);
const swPath = path.join(OUT, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__BUILD_VERSION__', version).replace('__ASSET_LIST__', JSON.stringify(assets.sort(), null, 1)));
// quick syntax sanity check of every JS module
let bad = 0;
for (const a of assets.filter((a) => a.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(OUT, a), 'utf8');
  if (/__ASSET_LIST__|__BUILD_VERSION__/.test(src)) { console.error('unstamped', a); bad++; }
}
if (bad) process.exit(1);
console.log(`✔ built dist/ (${assets.length} files, version ${version})`);
