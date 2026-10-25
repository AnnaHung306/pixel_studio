// Smoke test: starts the server on a temp data dir and exercises owner + AI REST + MCP endpoints.
// Usage: npm run smoke   (requires `npm install` first; builds are optional)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-smoke-'));
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const PW = 'smoke-test-pw';

const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, OWNER_PASSWORD: PW, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', (d) => (srvLog += d));
srv.stderr.on('data', (d) => (srvLog += d));

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, extra); } };

async function req(method, url, { token, body, raw } = {}) {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()), headers: r.headers };
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j, headers: r.headers };
}
const mcp = (key, method, params, id = 1) => req('POST', '/mcp', { token: key, body: { jsonrpc: '2.0', id, method, params } });

async function waitUp() {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start\n' + srvLog);
}

try {
  await waitUp();
  console.log(`\nPixel Studio smoke test → ${BASE} (DATA_DIR=${DATA})\n`);

  console.log('擁有者驗證');
  ok((await req('POST', '/api/auth/login', { body: { password: 'wrong' } })).status === 401, '錯誤密碼 → 401');
  const login = await req('POST', '/api/auth/login', { body: { password: PW } });
  ok(login.status === 200 && login.json.token, '正確密碼 → session token');
  const T = login.json.token;
  ok((await req('GET', '/api/owner/projects')).status === 401, '未登入存取擁有者 API → 401');

  console.log('專案與 API 金鑰');
  const pA = (await req('POST', '/api/owner/projects', { token: T, body: { name: 'Smoke A', width: 16, height: 16 } })).json;
  const pB = (await req('POST', '/api/owner/projects', { token: T, body: { name: 'Smoke B', width: 8, height: 8 } })).json;
  ok(pA.meta?.id && pB.meta?.id, '建立兩個專案');
  const A = pA.meta.id, B = pB.meta.id;
  // owner uploads a reference image
  const refPng = new PNG({ width: 4, height: 4 }); refPng.data.fill(200);
  const refUrl = 'data:image/png;base64,' + PNG.sync.write(refPng).toString('base64');
  const metaWithRef = { ...pA.meta, references: [{ id: 'Rsmoke', name: 'design.png', opacity: 0.5, visible: true, x: 0, y: 0, scale: 1 }] };
  ok((await req('PATCH', `/api/owner/projects/${A}`, { token: T, body: { meta: metaWithRef, refs: { Rsmoke: refUrl } } })).status === 200, '擁有者上傳參考圖');
  const scopes = ['project:read', 'canvas:read', 'canvas:write', 'layer:create', 'frame:create', 'reference:read'];
  const kr = await req('POST', '/api/owner/keys', { token: T, body: { name: 'smoke-ai', scopes, projects: [A], rateLimit: 1000 } });
  ok(kr.status === 200 && kr.json.key?.startsWith('pxs_'), '建立 API 金鑰（限專案 A）');
  const K = kr.json.key;
  ok((await req('GET', '/api/v1/projects')).status === 401, '沒有金鑰 → 401');
  const lp = await req('GET', '/api/v1/projects', { token: K });
  ok(lp.status === 200 && lp.json.projects.length === 1 && lp.json.projects[0].id === A, 'list_projects 只看到授權的專案');
  ok((await req('GET', `/api/v1/projects/${B}`, { token: K })).status === 403, '存取未授權專案 → 403');

  console.log('AI 繪圖（REST）');
  let r = await req('POST', `/api/v1/projects/${A}/draw/pixels`, { token: K, body: { layer: 0, frame: 0, pixels: [{ x: 1, y: 1, color: '#ff0000' }, [2, 1, '#00ff00'], { x: 3, y: 1, color: '#0000ff80' }] } });
  ok(r.status === 200 && r.json.changed === 3, 'draw_pixels', JSON.stringify(r.json));
  r = await req('POST', `/api/v1/projects/${A}/draw/shape`, { token: K, body: { shape: 'rect', x0: 4, y0: 4, x1: 10, y1: 10, color: '#ffec27', filled: false } });
  ok(r.status === 200 && r.json.changed === 24, 'draw_shape rect', JSON.stringify(r.json));
  r = await req('POST', `/api/v1/projects/${A}/draw/fill`, { token: K, body: { x: 7, y: 7, color: '#29adff' } });
  ok(r.status === 200 && r.json.changed === 25, 'fill（相連）', JSON.stringify(r.json));
  const fillActivity = r.json.activityId;
  r = await req('POST', `/api/v1/projects/${A}/draw/shape`, { token: K, body: { shape: 'ellipse', x0: 0, y0: 11, x1: 6, y1: 15, color: '#ff77a8', filled: true } });
  ok(r.status === 200 && r.json.changed > 10, 'draw_shape ellipse');
  const small = new PNG({ width: 2, height: 2 }); small.data.set([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255]);
  r = await req('POST', `/api/v1/projects/${A}/draw/paste`, { token: K, body: { image: PNG.sync.write(small).toString('base64'), x: 12, y: 0, scale: 2 } });
  ok(r.status === 200 && r.json.changed === 8, 'paste_image（含透明、放大 ×2）', JSON.stringify(r.json));
  r = await req('POST', `/api/v1/projects/${A}/layers`, { token: K, body: { name: 'AI 線稿' } });
  ok(r.status === 200 && r.json.layer.index === 1, 'add_layer');
  r = await req('POST', `/api/v1/projects/${A}/frames`, { token: K, body: { copyFrom: 0, duration: 150 } });
  ok(r.status === 200 && r.json.frame.index === 1, 'add_frame（複製影格 0）');
  r = await req('POST', `/api/v1/projects/${A}/frames/duration`, { token: K, body: { frame: 'all', duration: 120 } });
  ok(r.status === 200, 'set_frame_duration');
  r = await req('POST', `/api/v1/projects/${A}/tags`, { token: K, body: { name: 'idle', from: 0, to: 1, direction: 'pingpong' } });
  ok(r.status === 200, 'add_tag');
  r = await req('POST', `/api/v1/projects/${A}/palette`, { token: K, body: { colors: ['#123456'] } });
  ok(r.status === 403 && r.json.error.code === 'missing_scope', '沒有 palette:write 權限 → 403');
  r = await req('GET', `/api/v1/projects/${A}/pixels?layer=0&frame=1`, { token: K });
  ok(r.status === 200 && r.json.rows[1].slice(1, 4) !== '...' && Object.keys(r.json.legend).length > 3, 'get_cel_pixels（複製的影格有內容）');
  r = await req('GET', `/api/v1/projects/${A}/references`, { token: K });
  ok(r.status === 200 && r.json.references.length === 1 && r.json.references[0].dataUrl.startsWith('data:image/png'), 'get_reference_images');
  const ov = await req('GET', `/api/v1/projects/${A}`, { token: K });
  ok(ov.json.layers.length === 2 && ov.json.frames.length === 2 && ov.json.tags.length === 1, 'get_project_overview 反映變更');

  console.log('禁止刪除（伺服器端強制）');
  ok((await req('DELETE', `/api/v1/projects/${A}`, { token: K })).status === 403, 'DELETE 專案 → 403');
  ok((await req('DELETE', `/api/v1/projects/${A}/layers/0`, { token: K })).status === 403, 'DELETE 圖層 → 403');
  ok((await req('DELETE', `/api/v1/projects/${A}/frames/0`)).status === 403, 'DELETE（未驗證）也 → 403');
  r = await req('POST', `/api/v1/projects/${A}/draw/pixels`, { token: K, body: { layer: 1, frame: 0, pixels: [[0, 0, '#ffffff']] } });
  r = await req('POST', `/api/v1/projects/${A}/draw/pixels`, { token: K, body: { layer: 1, frame: 0, pixels: [[0, 0, '#00000000']] } });
  ok(r.status === 403 && r.json.error.code === 'forbidden_clear', '把 cel 擦成全空 → 403 forbidden_clear');
  r = await mcp(K, 'tools/call', { name: 'delete_layer', arguments: { projectId: A, layer: 0 } });
  ok(r.json.result?.isError && /刪除/.test(r.json.result.content[0].text), 'MCP 呼叫 delete_layer → 拒絕');
  // lock layer → 423
  const full = (await req('GET', `/api/owner/projects/${A}`, { token: T })).json;
  full.meta.layers[0].locked = true;
  await req('PATCH', `/api/owner/projects/${A}`, { token: T, body: { meta: full.meta } });
  r = await req('POST', `/api/v1/projects/${A}/draw/pixels`, { token: K, body: { layer: 0, pixels: [[0, 0, '#ffffff']] } });
  ok(r.status === 423, '鎖定的圖層 → 423');
  full.meta.layers[0].locked = false;
  await req('PATCH', `/api/owner/projects/${A}`, { token: T, body: { meta: full.meta } });

  console.log('匯出 PNG（透明度）');
  const img = await req('GET', `/api/v1/projects/${A}/image?frame=0&scale=1`, { token: K, raw: true });
  const png = PNG.sync.read(img.buf);
  const px = (x, y) => Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4));
  ok(img.type === 'image/png' && png.width === 16, 'GET image → image/png 16×16');
  ok(px(0, 2)[3] === 0, '未繪製像素 alpha = 0（透明背景保留）', JSON.stringify(px(0, 2)));
  ok(px(1, 1).join() === '255,0,0,255', '紅色像素正確', JSON.stringify(px(1, 1)));
  ok(px(3, 1)[3] === 128, '半透明像素 alpha = 128', JSON.stringify(px(3, 1)));
  ok(img.buf[25] === 6, 'PNG color type 6（RGBA）');
  const sheet = await req('GET', `/api/v1/projects/${A}/sheet?scale=2`, { token: K, raw: true });
  ok(PNG.sync.read(sheet.buf).width === 64, 'get_sprite_sheet（2 格 × ×2 = 64px 寬）');

  console.log('MCP（Streamable HTTP）');
  ok((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'initialize' } })).status === 401, 'MCP 無金鑰 → 401');
  r = await mcp(K, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  ok(r.json.result?.serverInfo?.name === 'pixel-studio' && r.headers.get('mcp-session-id'), 'initialize');
  ok((await req('POST', '/mcp', { token: K, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).status === 202, 'notifications/initialized → 202');
  r = await mcp(K, 'tools/list', {});
  const names = r.json.result.tools.map((t) => t.name);
  ok(names.includes('draw_pixels') && names.includes('get_frame_image') && names.includes('get_reference_images'), `tools/list（${names.length} 個工具）`);
  ok(!names.some((n) => /delete|remove|clear/.test(n)), 'tools/list 沒有任何刪除工具');
  r = await mcp(K, 'tools/call', { name: 'draw_shape', arguments: { projectId: A, shape: 'line', x0: 0, y0: 15, x1: 15, y1: 15, color: '#000000', layer: 1 } });
  ok(r.json.result && !r.json.result.isError, 'tools/call draw_shape');
  r = await mcp(K, 'tools/call', { name: 'get_frame_image', arguments: { projectId: A, frame: 0 } });
  const imgPart = r.json.result.content.find((c) => c.type === 'image');
  ok(imgPart && imgPart.mimeType === 'image/png' && PNG.sync.read(Buffer.from(imgPart.data, 'base64')).width === 16 * 20, 'tools/call get_frame_image 回傳 PNG base64（自動放大）');
  r = await mcp(K, 'tools/call', { name: 'get_reference_images', arguments: { projectId: A } });
  ok(r.json.result.content.some((c) => c.type === 'image'), 'tools/call get_reference_images 回傳圖片');

  console.log('活動紀錄與還原');
  const act = await req('GET', `/api/owner/activity?projectId=${A}`, { token: T });
  ok(act.status === 200 && act.json.activity.length >= 10 && act.json.activity.every((e) => e.keyName), `活動紀錄（${act.json.activity.length} 筆，含金鑰名稱）`);
  r = await req('POST', `/api/owner/activity/${fillActivity}/revert`, { token: T });
  ok(r.status === 200, '還原 AI 的 fill');
  const after = PNG.sync.read((await req('GET', `/api/v1/projects/${A}/image?frame=0`, { token: K, raw: true })).buf);
  ok(after.data[((7 * 20) * after.width + 7 * 20) * 4 + 3] === 0, '還原後填色區域回到透明');
  ok((await req('POST', `/api/owner/activity/${fillActivity}/revert`, { token: T })).status === 409, '重複還原 → 409');

  console.log('速率限制與撤銷');
  const k2 = (await req('POST', '/api/owner/keys', { token: T, body: { name: 'slow', scopes: ['project:read'], projects: '*', rateLimit: 3 } })).json;
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await req('GET', '/api/v1/projects', { token: k2.key })).status);
  ok(codes.slice(0, 3).every((c) => c === 200) && codes.includes(429), `每分鐘 3 次 → 第 4 次起 429（${codes.join(',')}）`);
  await req('POST', `/api/owner/keys/${k2.info.id}/revoke`, { token: T });
  ok((await req('GET', '/api/v1/projects', { token: k2.key })).status === 401, '撤銷的金鑰 → 401');

  console.log('文件');
  const oa = await req('GET', '/api/openapi.json');
  ok(oa.status === 200 && oa.json.openapi?.startsWith('3') && Object.keys(oa.json.paths).length >= 12, `OpenAPI 3 規格（${Object.keys(oa.json.paths).length} 個路徑）`);
  const docs = await fetch(BASE + '/docs');
  ok(docs.status === 200 && (await docs.text()).includes('MCP'), '/docs 頁面');
  const home = await fetch(BASE + '/');
  ok(home.status === 200 && (await home.text()).includes('Pixel Studio'), '前端首頁');
} catch (e) {
  fail++;
  console.error('💥', e);
} finally {
  const exited = new Promise((r) => srv.once('exit', r));
  srv.kill();
  await exited;
  console.log(`\n結果：${pass} 通過，${fail} 失敗\n`);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
}
