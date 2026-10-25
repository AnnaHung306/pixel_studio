// Render docs/使用說明書.md → PDF (pandoc → HTML → Chromium print), with CJK fonts and embedded screenshots.
//   node scripts/manual-pdf.js [output.pdf]
// Requires: pandoc, playwright chromium, and a CJK font (e.g. Noto Sans CJK TC: apt install fonts-noto-cjk).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

for (const k of Object.keys(process.env)) if (/_proxy$/i.test(k)) delete process.env[k];
const { chromium } = await import('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const SRC = path.join(DOCS, '使用說明書.md');
const OUT = path.resolve(process.argv[2] || path.join(DOCS, '使用說明書.pdf'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const template = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>$title$</title>
<style>
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
:root { --acc: #3d63c9; --ink: #1d1d2b; --mute: #5c5c70; --line: #d9d9e3; --soft: #f3f4f9; }
html { font-family: "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.65; }
body { margin: 0; }
h1, h2, h3 { line-height: 1.3; color: #14142a; }
h1 { font-size: 19pt; margin: 0 0 10pt; padding: 0 0 6pt; border-bottom: 2.5pt solid var(--acc); break-before: page; break-after: avoid; }
h2 { font-size: 13.5pt; margin: 16pt 0 6pt; padding-left: 7pt; border-left: 4pt solid var(--acc); break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; }
p, li { orphans: 2; widows: 2; }
a { color: var(--acc); text-decoration: none; word-break: break-all; }
code, pre { font-family: "Noto Sans Mono CJK TC", "DejaVu Sans Mono", monospace; font-size: 8.6pt; }
code { background: var(--soft); border: 0.5pt solid var(--line); border-radius: 3pt; padding: 0 3pt; }
pre { background: #1e1e2e; color: #e8e8f0; border-radius: 6pt; padding: 8pt 10pt; white-space: pre-wrap; word-break: break-all; break-inside: avoid; line-height: 1.45; }
pre code { background: none; border: 0; padding: 0; color: inherit; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.4pt; break-inside: auto; }
th { background: var(--acc); color: #fff; font-weight: 700; text-align: left; }
th, td { border: 0.6pt solid var(--line); padding: 4pt 6pt; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f7f8fc; }
td code, th code { white-space: nowrap; }
blockquote { margin: 8pt 0; padding: 6pt 10pt; background: #fff7e0; border-left: 4pt solid #e0a800; border-radius: 0 6pt 6pt 0; break-inside: avoid; }
blockquote p { margin: 2pt 0; }
figure { margin: 8pt 0 12pt; text-align: center; break-inside: avoid; }
figure img, p > img { max-width: 100%; max-height: 205mm; border-radius: 6pt; border: 0.6pt solid var(--line); box-shadow: 0 1pt 4pt #0002; }
figcaption { font-size: 8.8pt; color: var(--mute); margin-top: 3pt; }
.two { display: flex; gap: 10pt; justify-content: center; break-inside: avoid; }
.two figure { flex: 1; margin: 0; }
.two img { max-height: 150mm; }
/* cover */
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; }
.cover .logo { width: 30mm; height: 30mm; margin: 0 auto 10mm; image-rendering: pixelated; border-radius: 6mm; }
.cover h1.t { font-size: 30pt; border: 0; margin: 0 0 4mm; break-before: auto; padding: 0; }
.cover .sub { font-size: 13pt; color: var(--mute); }
.cover .ver { margin-top: 8mm; font-size: 10pt; color: var(--mute); }
.cover img.hero { width: 150mm; margin: 12mm auto 0; border-radius: 4mm; border: 0.6pt solid var(--line); box-shadow: 0 2pt 10pt #0003; }
/* toc */
nav#TOC { break-after: page; }
nav#TOC h2.toc { border: 0; padding: 0; font-size: 19pt; border-bottom: 2.5pt solid var(--acc); padding-bottom: 6pt; }
nav#TOC ul { list-style: none; padding-left: 0; margin: 0; }
nav#TOC > ul { columns: 2; column-gap: 12mm; }
nav#TOC > ul > li { break-inside: avoid; }
nav#TOC > ul > li { margin: 5pt 0 2pt; font-weight: 700; }
nav#TOC ul ul { padding-left: 14pt; font-weight: 400; columns: 1; }
nav#TOC ul ul li { margin: 1pt 0; font-size: 9.6pt; }
nav#TOC a { color: var(--ink); }
</style></head>
<body>
<section class="cover">
  <img class="logo" src="$logo$">
  <h1 class="t">$title$</h1>
  <div class="sub">$subtitle$</div>
  <div class="ver">版本 $version$ · $date$</div>
  <img class="hero" src="$hero$">
</section>
<nav id="TOC"><h2 class="toc">目錄</h2>$toc$</nav>
$body$
</body></html>`;

const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'pxs-manual-'));
const tplFile = path.join(tmpDir, 'template.html');
fs.writeFileSync(tplFile, template);
const htmlFile = path.join(DOCS, '.manual.tmp.html'); // inside docs/ so relative image paths resolve
const today = new Date().toISOString().slice(0, 10);
execFileSync('pandoc', [SRC, '-f', 'markdown+link_attributes+markdown_in_html_blocks', '-t', 'html5', '--standalone', '--columns=100000', '--toc', '--toc-depth=2',
  '--template', tplFile, '-V', `version=${pkg.version}`, '-V', `date=${today}`, '-V', 'logo=../public/icons/icon-512.png', '-V', 'hero=screenshots/ipad-pro-11-landscape.png',
  '-o', htmlFile]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
  if (missing.length) throw new Error('images failed to load: ' + missing.join(', '));
  await page.pdf({
    path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:'Noto Sans CJK TC',sans-serif;font-size:7.5pt;color:#888;padding:0 16mm;display:flex;justify-content:space-between"><span>Pixel Studio 使用說明書</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log('✔ wrote', OUT);
} finally {
  await browser.close();
  fs.rmSync(htmlFile, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
