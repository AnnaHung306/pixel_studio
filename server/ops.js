// AI-facing operations — single source of truth for REST (/api/v1), MCP (/mcp) and the OpenAPI spec.
// IMPORTANT: there is intentionally NO delete / remove / clear operation here. API keys can only add and draw.
import {
  celKey, createBuffer, hexToRgba, rgbaToHex, setPixel, linePoints, rectPoints, ellipsePoints,
  floodFill, isEmpty, pasteOver, uid, BLEND_MODES, scaleNearest,
} from '../public/js/core/raster.js';
import * as store from './store.js';
import { renderFramePNG, renderSheetPNG, decodePNG, decodeDataUrlOrB64 } from './png.js';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const MAX_PIXELS_PER_CALL = 65536;

// ---------- schema helpers ----------
const S = {
  projectId: { type: 'string', description: '專案 ID（若 API 金鑰只能存取一個專案可省略）' },
  layer: { type: ['integer', 'string'], description: '圖層：索引（0 = 最底層）、圖層 ID 或圖層名稱。省略 = 最上層' },
  frame: { type: ['integer', 'string'], description: '影格：索引（從 0 開始）或影格 ID。省略 = 0' },
  color: { type: 'string', description: '顏色 #RRGGBB 或 #RRGGBBAA（含透明度）' },
  int: (d) => ({ type: 'integer', description: d }),
};

// ---------- resolution helpers ----------
function resolveLayer(p, ref) {
  const L = p.meta.layers;
  if (ref === undefined || ref === null || ref === '') return L[L.length - 1];
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const l = L[Number(ref)];
    if (l) return l;
  }
  const l = L.find((x) => x.id === ref) || L.find((x) => x.name === ref);
  if (!l) throw new ApiError(404, 'layer_not_found', `找不到圖層: ${ref}`);
  return l;
}
function resolveFrameIndex(p, ref) {
  const F = p.meta.frames;
  if (ref === undefined || ref === null || ref === '') return 0;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const i = Number(ref);
    if (F[i]) return i;
    throw new ApiError(404, 'frame_not_found', `影格索引超出範圍: ${ref}（共 ${F.length} 格）`);
  }
  const i = F.findIndex((f) => f.id === ref);
  if (i < 0) throw new ApiError(404, 'frame_not_found', `找不到影格: ${ref}`);
  return i;
}
function color(c) {
  try { return hexToRgba(c); } catch (e) { throw new ApiError(400, 'bad_color', e.message); }
}
function writableCel(p, args) {
  const layer = resolveLayer(p, args.layer);
  if (layer.locked) throw new ApiError(423, 'layer_locked', `圖層「${layer.name}」已被擁有者鎖定`);
  const fi = resolveFrameIndex(p, args.frame);
  const key = celKey(layer.id, p.meta.frames[fi].id);
  const old = p.cels.get(key);
  const buf = old ? old.slice() : createBuffer(p.meta.width, p.meta.height);
  return { layer, fi, key, old, buf };
}
// Server-side enforcement: a write may never wipe a non-empty cel completely.
function commitCel(cel) {
  if (cel.old && !isEmpty(cel.old) && isEmpty(cel.buf))
    throw new ApiError(403, 'forbidden_clear', 'API 金鑰不允許清空整個 cel（無刪除權限）');
  return { cels: { [cel.key]: cel.buf } };
}
const cloneMeta = (m) => JSON.parse(JSON.stringify(m));
const layerInfo = (l, i) => ({ index: i, id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend });
const autoScale = (p) => Math.max(1, Math.min(20, Math.floor(512 / Math.max(p.meta.width, p.meta.height))));

// ---------- operations ----------
export const OPS = [
  {
    name: 'list_projects', scope: 'project:read', method: 'GET', path: '/projects', noProject: true,
    description: '列出此 API 金鑰可存取的專案。',
    input: { type: 'object', properties: {} },
    handler: (_p, _a, ctx) => ({ result: { projects: store.listProjects().filter((s) => ctx.canAccess(s.id)) } }),
  },
  {
    name: 'get_project_overview', scope: 'project:read', method: 'GET', path: '/projects/{projectId}',
    description: '取得專案概覽：尺寸、調色盤、圖層（索引 0 = 最底層）、影格與時長、標籤、參考圖列表，以及哪些 cel 有內容。',
    input: { type: 'object', properties: { projectId: S.projectId } },
    handler: (p) => {
      const m = p.meta;
      return {
        result: {
          id: m.id, name: m.name, width: m.width, height: m.height, palette: m.palette,
          layers: m.layers.map(layerInfo),
          frames: m.frames.map((f, i) => ({ index: i, id: f.id, duration: f.duration })),
          tags: m.tags,
          references: (m.references || []).map((r) => ({ id: r.id, name: r.name })),
          nonEmptyCels: m.layers.map((l) => ({ layer: l.name, frames: m.frames.map((f) => p.cels.has(celKey(l.id, f.id))) })),
          rev: p.rev,
          notes: '座標原點在左上角 (0,0)。可用 get_frame_image 取得 PNG 圖片查看目前畫面。API 金鑰無法刪除任何東西。',
        },
      };
    },
  },
  {
    name: 'get_frame_image', scope: 'canvas:read', method: 'GET', path: '/projects/{projectId}/image', image: true,
    description: '以 PNG 取得某影格的合成影像（或單一圖層），供視覺模型查看。scale 預設會自動放大到約 512px。REST: 預設回傳 image/png，加上 format=base64 會回傳 JSON。',
    input: {
      type: 'object',
      properties: {
        projectId: S.projectId, frame: S.frame,
        layer: { type: ['integer', 'string'], description: '只輸出這個圖層（省略 = 合成所有可見圖層）' },
        scale: S.int('放大倍率 1–20（省略 = 自動）'),
        format: { type: 'string', enum: ['png', 'base64'], description: '僅 REST：png（預設）或 base64 JSON' },
      },
    },
    handler: (p, a) => {
      const fi = resolveFrameIndex(p, a.frame);
      const layerId = a.layer !== undefined && a.layer !== '' ? resolveLayer(p, a.layer).id : null;
      const scale = a.scale ? Number(a.scale) : autoScale(p);
      const png = renderFramePNG(p, fi, { layerId, scale });
      return { result: { frame: fi, width: p.meta.width, height: p.meta.height, scale }, image: png };
    },
  },
  {
    name: 'get_sprite_sheet', scope: 'canvas:read', method: 'GET', path: '/projects/{projectId}/sheet', image: true,
    description: '把所有影格由左到右（可設定欄數）排成一張 PNG 精靈圖，方便一次檢視整段動畫。',
    input: { type: 'object', properties: { projectId: S.projectId, scale: S.int('放大倍率 1–20'), columns: S.int('每列影格數（預設全部一列）'), format: { type: 'string', enum: ['png', 'base64'] } } },
    handler: (p, a) => {
      const { png, cols, rows } = renderSheetPNG(p, { scale: a.scale ? Number(a.scale) : Math.max(1, Math.floor(autoScale(p) / 2)), columns: a.columns });
      return { result: { frames: p.meta.frames.length, columns: cols, rows }, image: png };
    },
  },
  {
    name: 'get_cel_pixels', scope: 'canvas:read', method: 'GET', path: '/projects/{projectId}/pixels',
    description: '取得單一 cel（圖層 × 影格）的像素。回傳 legend（字元 → 顏色）與 rows（每列一個字串，"." = 透明）。可用 x,y,w,h 取得局部區域。',
    input: { type: 'object', properties: { projectId: S.projectId, layer: S.layer, frame: S.frame, x: S.int('區域左上 x'), y: S.int('區域左上 y'), w: S.int('區域寬'), h: S.int('區域高') } },
    handler: (p, a) => {
      const layer = resolveLayer(p, a.layer);
      const fi = resolveFrameIndex(p, a.frame);
      const buf = p.cels.get(celKey(layer.id, p.meta.frames[fi].id)) || createBuffer(p.meta.width, p.meta.height);
      const W = p.meta.width, H = p.meta.height;
      const x0 = Math.max(0, Number(a.x) || 0), y0 = Math.max(0, Number(a.y) || 0);
      const w = Math.min(W - x0, Number(a.w) || W), h = Math.min(H - y0, Number(a.h) || H);
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+-=?@^~';
      const legend = { '.': 'transparent' }, map = new Map();
      const rows = [];
      let overflow = false;
      for (let y = y0; y < y0 + h; y++) {
        let row = '';
        for (let x = x0; x < x0 + w; x++) {
          const i = (y * W + x) * 4;
          if (buf[i + 3] === 0) { row += '.'; continue; }
          const hex = rgbaToHex([buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]);
          if (!map.has(hex)) {
            if (map.size >= chars.length) { overflow = true; map.set(hex, '?'); }
            else { const c = chars[map.size]; map.set(hex, c); legend[c] = hex; }
          }
          row += map.get(hex);
        }
        rows.push(row);
      }
      return { result: { layer: layer.name, frame: fi, x: x0, y: y0, width: w, height: h, legend, rows, ...(overflow ? { warning: '顏色超過 76 種，部分以 ? 表示' } : {}) } };
    },
  },
  {
    name: 'get_reference_images', scope: 'reference:read', method: 'GET', path: '/projects/{projectId}/references', image: true,
    description: '取得擁有者上傳的參考 / 設計圖（不會被匯出），讓 AI 可以照著設計稿繪製或製作動畫。',
    input: { type: 'object', properties: { projectId: S.projectId, id: { type: 'string', description: '只取得特定參考圖 ID' } } },
    handler: (p, a) => {
      const refs = (p.meta.references || []).filter((r) => !a.id || r.id === a.id);
      const images = [];
      const list = refs.map((r) => {
        const data = p.refs.get(r.id);
        const mime = (data && data.match(/^data:([^;,]+)/)?.[1]) || 'image/png';
        if (data) images.push({ data: decodeDataUrlOrB64(data), mime });
        return { id: r.id, name: r.name, mime, dataUrl: data || null };
      });
      return { result: { references: list }, images, restResult: { references: list } };
    },
  },
  {
    name: 'draw_pixels', scope: 'canvas:write', method: 'POST', path: '/projects/{projectId}/draw/pixels', write: true,
    description: '批次設定像素。pixels 可為 [{x,y,color}] 或 [[x,y,"#hex"]]；也可給 color + points:[[x,y],...] 用同一顏色畫多點。單次上限 65536 點。',
    input: {
      type: 'object', required: [],
      properties: {
        projectId: S.projectId, layer: S.layer, frame: S.frame,
        pixels: { type: 'array', description: '[{x,y,color}] 或 [[x,y,color]]', items: {} },
        color: S.color,
        points: { type: 'array', description: '[[x,y],...]，搭配 color 使用', items: { type: 'array', items: { type: 'integer' } } },
        blend: { type: 'string', enum: ['replace', 'over'], description: 'replace（預設，直接寫入）或 over（半透明顏色疊加）' },
      },
    },
    handler: (p, a) => {
      const cel = writableCel(p, a);
      const W = p.meta.width, H = p.meta.height;
      const mode = a.blend === 'over' ? 'over' : 'replace';
      let list = [];
      if (Array.isArray(a.pixels)) list = a.pixels.map((px) => (Array.isArray(px) ? { x: px[0], y: px[1], color: px[2] ?? a.color } : px));
      if (Array.isArray(a.points)) list = list.concat(a.points.map((pt) => ({ x: pt[0], y: pt[1], color: a.color })));
      if (!list.length) throw new ApiError(400, 'no_pixels', '需要 pixels 或 color + points');
      if (list.length > MAX_PIXELS_PER_CALL) throw new ApiError(413, 'too_many', `單次最多 ${MAX_PIXELS_PER_CALL} 點`);
      const cache = new Map();
      let n = 0;
      for (const px of list) {
        if (px.color === undefined) throw new ApiError(400, 'bad_color', '每個像素都需要 color');
        let c = cache.get(px.color);
        if (!c) { c = color(px.color); cache.set(px.color, c); }
        if (setPixel(cel.buf, W, H, Number(px.x), Number(px.y), c, mode)) n++;
      }
      return { result: { changed: n, layer: cel.layer.name, frame: cel.fi }, patch: commitCel(cel), summary: `${n} 個像素 @ ${cel.layer.name} / 影格 ${cel.fi + 1}` };
    },
  },
  {
    name: 'draw_shape', scope: 'canvas:write', method: 'POST', path: '/projects/{projectId}/draw/shape', write: true,
    description: '畫線、矩形或橢圓（像素完美，無反鋸齒）。矩形與橢圓以 (x0,y0)-(x1,y1) 為外框。',
    input: {
      type: 'object', required: ['shape', 'x0', 'y0', 'x1', 'y1', 'color'],
      properties: {
        projectId: S.projectId, layer: S.layer, frame: S.frame,
        shape: { type: 'string', enum: ['line', 'rect', 'ellipse'] },
        x0: S.int('起點 x'), y0: S.int('起點 y'), x1: S.int('終點 x'), y1: S.int('終點 y'),
        color: S.color, filled: { type: 'boolean', description: '矩形 / 橢圓是否填滿' },
      },
    },
    handler: (p, a) => {
      const cel = writableCel(p, a);
      const c = color(a.color);
      const [x0, y0, x1, y1] = [a.x0, a.y0, a.x1, a.y1].map((v) => Math.round(Number(v)));
      if ([x0, y0, x1, y1].some((v) => !Number.isFinite(v))) throw new ApiError(400, 'bad_coords', '座標需為整數');
      const pts = a.shape === 'line' ? linePoints(x0, y0, x1, y1)
        : a.shape === 'rect' ? rectPoints(x0, y0, x1, y1, !!a.filled)
        : a.shape === 'ellipse' ? ellipsePoints(x0, y0, x1, y1, !!a.filled)
        : null;
      if (!pts) throw new ApiError(400, 'bad_shape', 'shape 必須是 line / rect / ellipse');
      if (pts.length > 4 * MAX_PIXELS_PER_CALL) throw new ApiError(413, 'too_big', '形狀太大');
      for (const [x, y] of pts) setPixel(cel.buf, p.meta.width, p.meta.height, x, y, c, 'replace');
      return { result: { changed: pts.length }, patch: commitCel(cel), summary: `${a.shape} (${x0},${y0})-(${x1},${y1}) @ ${cel.layer.name} / 影格 ${cel.fi + 1}` };
    },
  },
  {
    name: 'fill', scope: 'canvas:write', method: 'POST', path: '/projects/{projectId}/draw/fill', write: true,
    description: '油漆桶填色。contiguous=true（預設）只填相連的同色區域；false 會替換整個 cel 中相同顏色的像素。',
    input: { type: 'object', required: ['x', 'y', 'color'], properties: { projectId: S.projectId, layer: S.layer, frame: S.frame, x: S.int('x'), y: S.int('y'), color: S.color, contiguous: { type: 'boolean' } } },
    handler: (p, a) => {
      const cel = writableCel(p, a);
      const n = floodFill(cel.buf, p.meta.width, p.meta.height, Number(a.x), Number(a.y), color(a.color), a.contiguous !== false && a.contiguous !== 'false');
      return { result: { changed: n }, patch: commitCel(cel), summary: `填色 (${a.x},${a.y}) ${n} px @ ${cel.layer.name} / 影格 ${cel.fi + 1}` };
    },
  },
  {
    name: 'paste_image', scope: 'canvas:write', method: 'POST', path: '/projects/{projectId}/draw/paste', write: true,
    description: '把 PNG（base64 或 data URL）以 source-over 方式貼到 cel 的 (x,y)。透明像素不會覆蓋既有內容。可用 scale 整數放大（最近鄰）。',
    input: { type: 'object', required: ['image'], properties: { projectId: S.projectId, layer: S.layer, frame: S.frame, image: { type: 'string', description: 'PNG base64 或 data:image/png;base64,...' }, x: S.int('左上 x（預設 0）'), y: S.int('左上 y（預設 0）'), scale: S.int('整數放大倍率（預設 1）') } },
    handler: (p, a) => {
      const cel = writableCel(p, a);
      let img;
      try { img = decodePNG(decodeDataUrlOrB64(a.image)); } catch (e) { throw new ApiError(400, 'bad_image', '無法解析 PNG: ' + e.message); }
      const s = Math.max(1, Math.min(20, Number(a.scale) || 1));
      if (img.w * img.h * s * s > 4096 * 4096) throw new ApiError(413, 'too_big', '圖片太大');
      const src = scaleNearest(img.buf, img.w, img.h, s);
      const n = pasteOver(cel.buf, p.meta.width, p.meta.height, src, img.w * s, img.h * s, Number(a.x) || 0, Number(a.y) || 0);
      return { result: { changed: n, imageWidth: img.w * s, imageHeight: img.h * s }, patch: commitCel(cel), summary: `貼上 ${img.w * s}×${img.h * s} 圖片 @ ${cel.layer.name} / 影格 ${cel.fi + 1}` };
    },
  },
  {
    name: 'add_layer', scope: 'layer:create', method: 'POST', path: '/projects/{projectId}/layers', write: true,
    description: '新增空白圖層（預設放在最上層，或放在指定圖層之上）。',
    input: { type: 'object', properties: { projectId: S.projectId, name: { type: 'string' }, opacity: { type: 'number', description: '0–1' }, blend: { type: 'string', enum: BLEND_MODES }, above: S.layer } },
    handler: (p, a) => {
      const m = cloneMeta(p.meta);
      const L = { id: uid('L'), name: String(a.name || `AI 圖層 ${m.layers.length + 1}`).slice(0, 60), visible: true, locked: false, opacity: Math.max(0, Math.min(1, a.opacity ?? 1)), blend: BLEND_MODES.includes(a.blend) ? a.blend : 'normal' };
      let idx = m.layers.length;
      if (a.above !== undefined) idx = m.layers.findIndex((l) => l.id === resolveLayer(p, a.above).id) + 1;
      m.layers.splice(idx, 0, L);
      return { result: { layer: layerInfo(L, idx) }, patch: { meta: m }, summary: `新增圖層「${L.name}」` };
    },
  },
  {
    name: 'add_frame', scope: 'frame:create', method: 'POST', path: '/projects/{projectId}/frames', write: true,
    description: '新增影格。copyFrom 指定要複製內容的影格（製作動畫時常用：複製上一格再修改）；insertAt 指定插入位置索引（預設最後）。',
    input: { type: 'object', properties: { projectId: S.projectId, duration: S.int('時長 ms（預設同來源影格或 100）'), copyFrom: S.frame, insertAt: S.int('插入位置索引') } },
    handler: (p, a) => {
      const m = cloneMeta(p.meta);
      const src = a.copyFrom !== undefined && a.copyFrom !== '' ? resolveFrameIndex(p, a.copyFrom) : -1;
      const F = { id: uid('F'), duration: Math.max(10, Math.min(65535, Number(a.duration) || (src >= 0 ? m.frames[src].duration : 100))) };
      const at = a.insertAt !== undefined ? Math.max(0, Math.min(m.frames.length, Number(a.insertAt))) : m.frames.length;
      m.frames.splice(at, 0, F);
      for (const t of m.tags) { if (t.from >= at) t.from++; if (t.to >= at) t.to++; }
      const patch = { meta: m, cels: {} };
      if (src >= 0) {
        const sid = p.meta.frames[src].id;
        for (const l of m.layers) { const b = p.cels.get(celKey(l.id, sid)); if (b) patch.cels[celKey(l.id, F.id)] = b.slice(); }
      }
      return { result: { frame: { index: at, id: F.id, duration: F.duration }, copiedFrom: src >= 0 ? src : null }, patch, summary: `新增影格 #${at + 1}${src >= 0 ? `（複製自 #${src + 1}）` : ''}` };
    },
  },
  {
    name: 'set_frame_duration', scope: 'frame:create', method: 'POST', path: '/projects/{projectId}/frames/duration', write: true,
    description: '設定影格時長（毫秒）。frame 可為單一索引 / ID，或 "all" 套用全部影格。',
    input: { type: 'object', required: ['duration'], properties: { projectId: S.projectId, frame: { type: ['integer', 'string'], description: '影格索引 / ID 或 "all"' }, duration: S.int('毫秒 10–65535') } },
    handler: (p, a) => {
      const m = cloneMeta(p.meta);
      const d = Math.max(10, Math.min(65535, Number(a.duration) || 100));
      const idx = a.frame === 'all' ? m.frames.map((_, i) => i) : [resolveFrameIndex(p, a.frame)];
      for (const i of idx) m.frames[i].duration = d;
      return { result: { frames: idx, duration: d }, patch: { meta: m }, summary: `影格 ${a.frame === 'all' ? '全部' : '#' + (idx[0] + 1)} 時長 ${d}ms` };
    },
  },
  {
    name: 'add_tag', scope: 'frame:create', method: 'POST', path: '/projects/{projectId}/tags', write: true,
    description: '新增動畫標籤（命名的影格範圍，例如 "walk" 0–3）。',
    input: { type: 'object', required: ['name', 'from', 'to'], properties: { projectId: S.projectId, name: { type: 'string' }, from: S.int('起始影格索引'), to: S.int('結束影格索引'), direction: { type: 'string', enum: ['forward', 'reverse', 'pingpong'] }, color: S.color } },
    handler: (p, a) => {
      const m = cloneMeta(p.meta);
      const n = m.frames.length;
      const from = Math.max(0, Math.min(n - 1, Number(a.from) || 0)), to = Math.max(from, Math.min(n - 1, Number(a.to) || 0));
      const t = { id: uid('T'), name: String(a.name).slice(0, 40), from, to, direction: ['forward', 'reverse', 'pingpong'].includes(a.direction) ? a.direction : 'forward', color: a.color ? rgbaToHex(color(a.color), false) : '#5b6ee1' };
      m.tags.push(t);
      return { result: { tag: t }, patch: { meta: m }, summary: `新增標籤「${t.name}」${from + 1}–${to + 1}` };
    },
  },
  {
    name: 'set_palette', scope: 'palette:write', method: 'POST', path: '/projects/{projectId}/palette', write: true,
    description: '設定或附加調色盤顏色。mode=append（預設）只新增；mode=replace 取代整組（不影響畫布像素）。',
    input: { type: 'object', required: ['colors'], properties: { projectId: S.projectId, colors: { type: 'array', items: { type: 'string' } }, mode: { type: 'string', enum: ['append', 'replace'] } } },
    handler: (p, a) => {
      if (!Array.isArray(a.colors) || !a.colors.length) throw new ApiError(400, 'bad_colors', 'colors 需為非空陣列');
      const cols = a.colors.slice(0, 256).map((c) => rgbaToHex(color(c)));
      const m = cloneMeta(p.meta);
      m.palette = a.mode === 'replace' ? cols : [...m.palette, ...cols.filter((c) => !m.palette.includes(c))];
      return { result: { palette: m.palette }, patch: { meta: m }, summary: `調色盤 ${a.mode === 'replace' ? '取代' : '新增'} ${cols.length} 色` };
    },
  },
];

export const OPS_BY_NAME = Object.fromEntries(OPS.map((o) => [o.name, o]));

// ---------- rate limiting ----------
const buckets = new Map();
function rateLimit(key) {
  const now = Date.now();
  const cap = key.rateLimit || 120;
  let b = buckets.get(key.id);
  if (!b) { b = { tokens: cap, t: now }; buckets.set(key.id, b); }
  b.tokens = Math.min(cap, b.tokens + ((now - b.t) / 60000) * cap);
  b.t = now;
  if (b.tokens < 1) throw new ApiError(429, 'rate_limited', `超過速率限制（每分鐘 ${cap} 次）`);
  b.tokens -= 1;
}

export function keyCanAccess(key, projectId) {
  return key.projects === '*' || (Array.isArray(key.projects) && key.projects.includes(projectId));
}

const DELETE_WORDS = /(delete|remove|clear|erase|destroy|drop|wipe|purge|truncate)/i;

// Execute an op for an API key. `hub` broadcasts patches to live clients.
export function runOp(name, args, key, hub, via = 'rest') {
  if (DELETE_WORDS.test(name || '')) throw new ApiError(403, 'forbidden_delete', 'API 金鑰沒有任何刪除權限');
  const op = OPS_BY_NAME[name];
  if (!op) throw new ApiError(404, 'unknown_op', `未知的操作: ${name}`);
  rateLimit(key);
  if (!key.scopes.includes(op.scope)) throw new ApiError(403, 'missing_scope', `此 API 金鑰缺少權限範圍 ${op.scope}`);
  args = args || {};
  const ctx = { canAccess: (id) => keyCanAccess(key, id) };
  let p = null;
  if (!op.noProject) {
    let pid = args.projectId;
    if (!pid && Array.isArray(key.projects) && key.projects.length === 1) pid = key.projects[0];
    if (!pid) throw new ApiError(400, 'project_required', '需要 projectId');
    if (!keyCanAccess(key, pid)) throw new ApiError(403, 'project_forbidden', '此 API 金鑰無法存取這個專案');
    p = store.getProject(pid);
    if (!p) throw new ApiError(404, 'project_not_found', '找不到專案');
  }
  store.touchKey(key);
  const out = op.handler(p, args, ctx);
  let entry = null;
  if (out.patch) {
    const inverse = store.applyPatch(p, out.patch);
    entry = store.logActivity({ keyId: key.id, keyName: key.name, projectId: p.meta.id, action: op.name, summary: out.summary || op.name, via, write: true }, inverse);
    hub?.broadcast(p.meta.id, {
      type: 'patch', projectId: p.meta.id, rev: p.rev,
      patch: store.patchForWire(p, out.patch),
      origin: { kind: 'ai', keyId: key.id, keyName: key.name, action: op.name, summary: entry.summary, activityId: entry.id },
    });
    hub?.broadcastAll({ type: 'activity', entry });
  } else {
    entry = store.logActivity({ keyId: key.id, keyName: key.name, projectId: p?.meta.id || null, action: op.name, summary: op.name, via, write: false }, null);
  }
  return { ...out, activityId: entry?.id, rev: p?.rev };
}
