// Dialogs: new project, project browser, canvas size, export, import, server / AI settings, shortcuts.
import { app, on, toast, newDoc, W, H } from './state.js';
import { h, modal, confirmBox, pickFile, readAs } from './dom.js';
import * as A from './actions.js';
import * as io from './io.js';
import * as store from './storage.js';
import { cloud, loggedIn, login, logout, api, listCloudProjects, openCloudProject, uploadCurrent, deleteCloudProject, onDocOpened, detectServer } from './cloud.js';
import { PALETTES } from './core/palettes.js';

export const hooks = { openDoc: null };

// ---------- new project ----------
export function newProjectDialog() {
  let w = 32, hh = 32;
  const wi = h('input', { type: 'number', min: 1, max: 2048, value: w });
  const hi = h('input', { type: 'number', min: 1, max: 2048, value: hh });
  const name = h('input', { type: 'text', value: '未命名' });
  const pal = h('select', {}, Object.entries(PALETTES).map(([k, p]) => h('option', { value: k }, p.name)));
  const presets = h('div', { class: 'presets' }, [16, 32, 64, 128, 256].map((s) => h('button', { class: 'btn', onclick: () => { wi.value = hi.value = s; } }, `${s}×${s}`)),
    h('button', { class: 'btn', onclick: () => { wi.value = 320; hi.value = 180; } }, '320×180'));
  return modal({
    title: '新增專案',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, '名稱'), name),
      h('div', { class: 'field' }, h('span', {}, '畫布尺寸（像素）'), presets, h('div', { class: 'row' }, h('label', {}, '寬'), wi, h('label', {}, '高'), hi)),
      h('label', { class: 'field' }, h('span', {}, '調色盤'), pal)),
    buttons: [{ label: '取消', value: null }, {
      label: '建立', class: 'primary', onClick: () => {
        const W2 = Math.max(1, Math.min(2048, parseInt(wi.value, 10) || 32)), H2 = Math.max(1, Math.min(2048, parseInt(hi.value, 10) || 32));
        hooks.openDoc(newDoc({ name: name.value.trim() || '未命名', width: W2, height: H2, palette: PALETTES[pal.value].colors }));
      },
    }],
  }).promise;
}

// ---------- project browser ----------
export async function projectsDialog() {
  const body = h('div', {});
  const d = modal({ title: '專案', body, wide: true, buttons: [{ label: '開啟 .pxs / 圖片…', onClick: async () => { await importDialog(true); } }, { label: '＋ 新增專案', class: 'primary', onClick: () => { newProjectDialog(); } }] });
  const fill = async () => {
    body.innerHTML = '';
    const local = await store.listProjects();
    body.append(h('h4', { style: { margin: '4px 0 8px' } }, '本機專案（儲存在此瀏覽器）'));
    const grid = h('div', { class: 'proj-grid' });
    if (!local.length) grid.append(h('div', { class: 'small' }, '尚無專案'));
    for (const p of local) {
      grid.append(h('div', { class: 'proj-card', onclick: async () => { const doc = await store.loadProject(p.id); if (doc) { hooks.openDoc(doc, { keepView: false }); d.close(); } } },
        p.thumb ? h('img', { src: p.thumb }) : h('div', { class: 'ph checker' }),
        h('div', { class: 'nm' }, (p.cloud ? '☁️ ' : '') + p.name),
        h('div', { class: 'meta' }, `${p.width}×${p.height} · ${p.frames} 格 · ${new Date(p.updatedAt).toLocaleString()}`),
        h('button', { class: 'del', title: '刪除', onclick: async (e) => { e.stopPropagation(); if (p.id === app.doc?.meta.id) return toast('無法刪除目前開啟的專案'); if (await confirmBox('刪除專案', `確定要刪除本機專案「${p.name}」？此動作無法復原。`, '刪除', true)) { await store.deleteProject(p.id); fill(); } } }, '🗑')));
    }
    body.append(grid);
    if (loggedIn()) {
      body.append(h('h4', { style: { margin: '16px 0 8px' } }, '伺服器專案'));
      const g2 = h('div', { class: 'proj-grid' });
      try {
        const list = await listCloudProjects();
        if (!list.length) g2.append(h('div', { class: 'small' }, '伺服器上尚無專案。可在「伺服器 / AI」設定中上傳目前專案。'));
        for (const p of list) g2.append(h('div', { class: 'proj-card', onclick: async () => { try { hooks.openDoc(await openCloudProject(p.id)); d.close(); } catch (e) { toast('開啟失敗：' + e.message); } } },
          h('div', { class: 'ph checker', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' } }, '☁️'),
          h('div', { class: 'nm' }, p.name), h('div', { class: 'meta' }, `${p.width}×${p.height} · ${p.frames} 格 · ${new Date(p.updatedAt).toLocaleString()}`)));
      } catch (e) { g2.append(h('div', { class: 'small' }, '讀取失敗：' + e.message)); }
      body.append(g2);
    }
  };
  fill();
}

// ---------- canvas size ----------
export function canvasSizeDialog() {
  const wi = h('input', { type: 'number', min: 1, max: 2048, value: W() });
  const hi = h('input', { type: 'number', min: 1, max: 2048, value: H() });
  let ax = 0.5, ay = 0.5;
  const anchor = h('div', { class: 'anchor' });
  const drawAnchor = () => {
    anchor.innerHTML = '';
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) anchor.append(h('button', { class: ax === i / 2 && ay === j / 2 ? 'on' : '', onclick: () => { ax = i / 2; ay = j / 2; drawAnchor(); } }));
  };
  drawAnchor();
  const dlg = modal({
    title: '畫布大小 / 縮放',
    body: h('div', {},
      h('div', { class: 'row' }, h('label', {}, '寬'), wi, h('label', {}, '高'), hi),
      h('div', { class: 'field' }, h('span', {}, '錨點（內容對齊位置）'), anchor),
      h('div', { class: 'field' }, h('span', {}, '或縮放整個精靈（最近鄰，不模糊）'),
        h('div', { class: 'presets' }, [0.5, 2, 3, 4].map((f) => h('button', { class: 'btn', onclick: () => { A.scaleSprite(f); dlg.close(null); } }, `×${f}`)))),
      h('p', { class: 'small' }, '提示：選取範圍後可用「裁切到選取範圍」。')),
    buttons: [{ label: '取消', value: null }, { label: '套用', class: 'primary', onClick: () => A.resizeCanvas(Math.max(1, Math.min(2048, +wi.value | 0)), Math.max(1, Math.min(2048, +hi.value | 0)), ax, ay) }],
  });
}

// ---------- export ----------
export function exportDialog() {
  const fmt = h('select', {},
    [['png', 'PNG — 目前影格'], ['zip', 'PNG — 所有影格（ZIP）'], ['sheet', '精靈圖 PNG + JSON（Aseprite 相容格式）'], ['gif', 'GIF 動畫（保留透明）'], ['apng', 'APNG 動畫（完整透明度）'], ['pxs', 'Pixel Studio 專案檔 .pxs']].map(([v, l]) => h('option', { value: v }, l)));
  const scale = h('input', { type: 'range', min: 1, max: 20, value: Math.max(1, Math.min(20, Math.floor(256 / Math.max(W(), H()))) || 1) });
  const sv = h('span', {}, '');
  const updS = () => (sv.textContent = `×${scale.value}（${W() * scale.value}×${H() * scale.value}）`);
  scale.oninput = updS; updS();
  const range = h('select', {}, h('option', { value: 'all' }, '所有影格'), h('option', { value: 'current' }, '目前影格'), app.doc.meta.tags.map((t) => h('option', { value: t.id }, `標籤：${t.name}`)));
  const loop = h('select', {}, [['loop', '循環'], ['pingpong', '來回'], ['once', '播放一次']].map(([v, l]) => h('option', { value: v, selected: app.ui.loopMode === v }, l)));
  const layout = h('select', {}, [['horizontal', '橫排'], ['vertical', '直排'], ['grid', '格狀']].map(([v, l]) => h('option', { value: v }, l)));
  const cols = h('input', { type: 'number', min: 1, max: 256, value: 8 });
  const zip = h('input', { type: 'checkbox' });
  const rowRange = h('div', { class: 'row' }, h('label', {}, '範圍'), range);
  const rowLoop = h('div', { class: 'row' }, h('label', {}, '循環'), loop);
  const rowSheet = h('div', { class: 'row' }, h('label', {}, '排列'), layout, h('label', {}, '欄數'), cols, h('label', {}, zip, ' 打包 ZIP'));
  const rowScale = h('div', { class: 'row' }, h('label', {}, '放大'), scale, sv);
  const upd = () => {
    const f = fmt.value;
    rowRange.style.display = ['zip', 'sheet', 'gif', 'apng'].includes(f) ? '' : 'none';
    rowLoop.style.display = ['gif', 'apng'].includes(f) ? '' : 'none';
    rowSheet.style.display = f === 'sheet' ? '' : 'none';
    rowScale.style.display = f === 'pxs' ? 'none' : '';
  };
  fmt.onchange = upd; upd();
  modal({
    title: '匯出',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, '格式'), fmt), rowScale, rowRange, rowLoop, rowSheet,
      h('p', { class: 'small' }, '參考圖不會被匯出。透明背景會保留。GIF 只支援全透明 / 不透明（半透明像素以 50% 為界）；需要半透明請用 APNG 或 PNG。')),
    buttons: [{ label: '取消', value: null }, {
      label: '匯出', class: 'primary', onClick: async () => {
        const s = +scale.value, idx = io.frameIndices(range.value);
        try {
          if (fmt.value === 'png') await io.exportPNG(s);
          else if (fmt.value === 'zip') await io.exportFramesZip(s, idx);
          else if (fmt.value === 'sheet') await io.exportSheet(s, idx, { layout: layout.value, columns: +cols.value, zip: zip.checked });
          else if (fmt.value === 'gif') await io.exportGIF(s, idx, loop.value);
          else if (fmt.value === 'apng') await io.exportAPNG(s, idx, loop.value);
          else io.exportPxs();
        } catch (e) { console.error(e); toast('匯出失敗：' + e.message); return false; }
      },
    }],
  });
}

// ---------- import ----------
export async function importDialog(asProjectDefault = false) {
  const f = await pickFile('.pxs,.png,.gif,.jpg,.jpeg,.webp,.bmp,image/*');
  if (!f) return;
  return importFile(f, asProjectDefault);
}
export async function importFile(f, asProjectDefault = false) {
  try {
    if (f.name.toLowerCase().endsWith('.pxs') || f.name.toLowerCase().endsWith('.json')) {
      const doc = await io.readPxs(f);
      const existing = await store.loadProject(doc.meta.id);
      if (existing) doc.meta.id = 'P' + Math.random().toString(16).slice(2, 18);
      hooks.openDoc(doc);
      toast('已開啟專案檔');
      return;
    }
    const img = await io.decodeImageFile(f);
    if (asProjectDefault || !app.doc) return openImageAsProject(img, f.name);
    const choice = await modal({
      title: `匯入圖片：${f.name}`,
      body: h('div', {}, h('p', {}, `${img.w}×${img.h}${img.frames.length > 1 ? `，${img.frames.length} 個影格` : ''}`), h('p', { class: 'small' }, '要如何匯入？')),
      buttons: [{ label: '新專案', value: 'project' }, { label: '新圖層', value: 'layer' }, { label: '參考圖（描圖用）', value: 'ref', class: 'primary' }],
    }).promise;
    if (choice === 'project') openImageAsProject(img, f.name);
    else if (choice === 'layer') io.importAsLayer(img, f.name);
    else if (choice === 'ref') importReference(f, img);
  } catch (e) { console.error(e); toast('匯入失敗：' + e.message); }
}
function openImageAsProject(img, name) {
  if (img.w > 2048 || img.h > 2048) return toast('圖片太大（上限 2048×2048）');
  if (img.w * img.h > 512 * 512) toast('提示：大圖可能較慢');
  hooks.openDoc(io.docFromImage(img, name));
}
export async function importReference(file, img) {
  file = file || await pickFile('image/*');
  if (!file) return;
  img = img || await io.decodeImageFile(file);
  let url = img.dataUrl || await readAs(file, 'dataurl');
  if (img.w * img.h > 2048 * 2048) return toast('參考圖太大');
  A.addReference(file.name, url, img.w, img.h);
  toast('已加入參考圖，可在「參考圖」面板調整透明度與位置');
}

// ---------- server / AI settings ----------
export async function serverDialog(tab = null) {
  await detectServer();
  const body = h('div', {});
  const d = modal({ title: '伺服器 · 雲端 · AI API', body, wide: true });
  if (!cloud.available) {
    body.append(
      h('p', {}, '目前為 ', h('b', {}, '單機模式'), '：專案會自動儲存在此瀏覽器（IndexedDB），也可以存成 .pxs 檔。'),
      h('p', {}, '要使用伺服器同步、AI API（REST + MCP）與即時同步，請在電腦上執行本機伺服器：'),
      h('pre', {}, 'npm install\nnpm run build\nOWNER_PASSWORD=你的密碼 npm start'),
      h('p', { class: 'small' }, '然後在電腦用 http://localhost:8787 開啟，或在同一個 Wi-Fi 的 iPad / iPhone 開啟終端機顯示的區網網址（例如 http://192.168.1.20:8787）。'));
    return;
  }
  if (!loggedIn()) {
    const pw = h('input', { type: 'password', placeholder: '擁有者密碼', autocomplete: 'current-password' });
    const go = async () => { try { await login(pw.value); d.close(); serverDialog(); toast('已登入'); } catch (e) { toast(e.message); } };
    pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    body.append(h('p', {}, '已偵測到 Pixel Studio 伺服器。請以擁有者密碼登入（伺服器啟動時於終端機顯示，或環境變數 OWNER_PASSWORD）。'),
      h('div', { class: 'row' }, pw, h('button', { class: 'btn primary', onclick: go }, '登入')));
    return;
  }
  const tabs = [['sync', '同步'], ['keys', 'API 金鑰'], ['activity', '活動紀錄'], ['connect', '連接 AI']];
  let cur = tab || 'sync';
  const tabBar = h('div', { class: 'tabs' });
  const content = h('div', {});
  body.append(tabBar, content);
  const show = (t) => {
    cur = t;
    tabBar.innerHTML = '';
    tabs.forEach(([k, l]) => tabBar.append(h('div', { class: 'tab' + (k === cur ? ' on' : ''), onclick: () => show(k) }, l)));
    content.innerHTML = '';
    ({ sync: syncTab, keys: keysTab, activity: activityTab, connect: connectTab })[t](content, d);
  };
  show(cur);
}

function syncTab(el, d) {
  const doc = app.doc;
  el.append(
    h('p', {}, '目前專案：', h('b', {}, doc.meta.name), doc.cloud ? '　☁️ 已與伺服器即時同步' : '　💾 僅存在此瀏覽器'),
    doc.cloud
      ? h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { doc.cloud = false; onDocOpened(); d.close(); toast('已停止同步（伺服器上的副本保留）'); } }, '停止同步此專案'),
        h('span', { class: 'small' }, `專案 ID：${doc.meta.id}`))
      : h('button', { class: 'btn primary', onclick: async () => { try { await uploadCurrent(); d.close(); } catch (e) { toast('上傳失敗：' + e.message); } } }, '☁️ 上傳並同步目前專案'),
    h('p', { class: 'small' }, '同步後，此專案的變更會即時存到伺服器；AI 透過 API 的繪製也會即時出現在畫布上，並出現在歷史紀錄中（可復原）。'),
    h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { class: 'btn', onclick: async () => { await logout(); d.close(); toast('已登出'); } }, '登出')));
  // cloud project list w/ delete (owner only)
  const list = h('div', {});
  el.append(h('h4', {}, '伺服器上的專案'), list);
  listCloudProjects().then((ps) => {
    if (!ps.length) list.append(h('div', { class: 'small' }, '（無）'));
    const t = h('table', { class: 't' }, h('tr', {}, h('th', {}, '名稱'), h('th', {}, '尺寸'), h('th', {}, 'ID'), h('th', {}, '')));
    for (const p of ps) t.append(h('tr', {}, h('td', {}, p.name), h('td', {}, `${p.width}×${p.height}·${p.frames}格`), h('td', {}, h('code', {}, p.id)),
      h('td', {}, h('button', { class: 'sb', onclick: async () => { hooks.openDoc(await openCloudProject(p.id)); d.close(); } }, '開啟'), ' ',
        h('button', { class: 'sb', onclick: async () => { if (await confirmBox('刪除伺服器專案', `確定刪除「${p.name}」？（伺服器會保留 .deleted 備份檔）`, '刪除', true)) { await deleteCloudProject(p.id); d.close(); serverDialog('sync'); } } }, '刪除'))));
    list.append(t);
  }).catch((e) => list.append(h('div', { class: 'small' }, e.message)));
}

async function keysTab(el) {
  let data;
  try { data = await api('GET', 'api/owner/keys'); } catch (e) { el.append(h('p', {}, e.message)); return; }
  let projects = [];
  try { projects = await listCloudProjects(); } catch {}
  const { keys, scopes } = data;
  const t = h('table', { class: 't' }, h('tr', {}, h('th', {}, '名稱'), h('th', {}, '權限範圍'), h('th', {}, '專案'), h('th', {}, '速率'), h('th', {}, '狀態'), h('th', {})));
  for (const k of keys.slice().reverse()) {
    t.append(h('tr', { style: { opacity: k.revokedAt ? 0.45 : 1 } },
      h('td', {}, h('b', {}, k.name), h('div', { class: 'small' }, h('code', {}, k.prefix + '…'))),
      h('td', {}, k.scopes.map((s) => h('div', {}, h('code', {}, s)))),
      h('td', {}, k.projects === '*' ? '全部' : k.projects.map((id) => projects.find((p) => p.id === id)?.name || id).join('、')),
      h('td', {}, `${k.rateLimit}/分`),
      h('td', {}, k.revokedAt ? '已撤銷' : '有效', h('div', { class: 'small' }, k.lastUsedAt ? '最後使用 ' + new Date(k.lastUsedAt).toLocaleString() : '尚未使用')),
      h('td', {}, k.revokedAt ? '' : h('button', { class: 'sb', onclick: async () => { if (await confirmBox('撤銷金鑰', `撤銷「${k.name}」後，使用它的 AI 將立即無法存取。`, '撤銷', true)) { await api('POST', `api/owner/keys/${k.id}/revoke`); el.innerHTML = ''; keysTab(el); } } }, '撤銷'))));
  }
  // create form
  const name = h('input', { type: 'text', placeholder: '例如 Claude、ChatGPT', value: 'AI 助手' });
  const checks = Object.entries(scopes).map(([s, desc]) => {
    const c = h('input', { type: 'checkbox', checked: s !== 'palette:write' || true, value: s });
    return h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } }, c, h('code', {}, s), h('span', { class: 'small' }, desc));
  });
  const allProj = h('input', { type: 'radio', name: 'kp', checked: true });
  const someProj = h('input', { type: 'radio', name: 'kp' });
  const projChecks = projects.map((p) => h('label', { style: { display: 'inline-flex', gap: '4px', marginRight: '10px' } }, h('input', { type: 'checkbox', value: p.id, checked: p.id === app.doc.meta.id }), p.name));
  const rate = h('input', { type: 'number', min: 1, max: 10000, value: 120 });
  const result = h('div', {});
  const create = async () => {
    const sc = checks.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value);
    const pj = allProj.checked ? '*' : projChecks.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value);
    if (!sc.length) return toast('至少選一個權限');
    if (pj !== '*' && !pj.length) return toast('請選擇至少一個專案');
    try {
      const r = await api('POST', 'api/owner/keys', { name: name.value, scopes: sc, projects: pj, rateLimit: +rate.value });
      result.innerHTML = '';
      result.append(h('div', { style: { background: '#16402a', padding: '10px', borderRadius: '8px', marginTop: '10px' } },
        h('b', {}, '✅ 金鑰已建立 — 只會顯示這一次，請立即複製：'),
        h('pre', {}, r.key),
        h('button', { class: 'btn', onclick: () => copyText(r.key) }, '複製金鑰'),
        connectSnippets(r.key, pj === '*' ? (app.doc.cloud ? app.doc.meta.id : 'PROJECT_ID') : pj[0])));
      t.remove();
    } catch (e) { toast(e.message); }
  };
  el.append(h('p', { class: 'small' }, '🔒 API 金鑰沒有任何刪除能力（伺服器端強制）：不能刪除專案、圖層、影格或 cel，也不能清空整個 cel。鎖定的圖層 AI 無法寫入。'),
    t,
    h('h4', {}, '建立新金鑰'),
    h('label', { class: 'field' }, h('span', {}, '名稱'), name),
    h('div', { class: 'field' }, h('span', {}, '權限範圍'), checks),
    h('div', { class: 'field' }, h('span', {}, '可存取的專案'), h('label', {}, allProj, ' 全部專案'), h('label', {}, someProj, ' 指定專案：'), h('div', {}, projChecks.length ? projChecks : h('span', { class: 'small' }, '（伺服器上尚無專案，請先在「同步」上傳）'))),
    h('div', { class: 'row' }, h('label', {}, '速率限制（每分鐘請求數）'), rate),
    h('button', { class: 'btn primary', onclick: create }, '建立金鑰'),
    result);
}

function copyText(s) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(s).then(() => toast('已複製'), () => fallbackCopy(s));
  else fallbackCopy(s);
}
function fallbackCopy(s) {
  const ta = h('textarea', { value: s, style: { position: 'fixed', opacity: 0 } });
  document.body.append(ta); ta.select();
  try { document.execCommand('copy'); toast('已複製'); } catch { toast('請手動複製'); }
  ta.remove();
}

function connectSnippets(key = 'pxs_你的金鑰', pid = 'PROJECT_ID') {
  const base = location.origin;
  return h('div', {},
    h('h4', {}, 'REST（curl）'),
    h('pre', {}, `curl -H "Authorization: Bearer ${key}" ${base}/api/v1/projects\n\ncurl -H "Authorization: Bearer ${key}" "${base}/api/v1/projects/${pid}/image?frame=0" -o frame.png\n\ncurl -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '{"shape":"rect","x0":2,"y0":2,"x1":12,"y1":12,"color":"#ff004d","filled":true}' \\\n  ${base}/api/v1/projects/${pid}/draw/shape`),
    h('h4', {}, 'MCP（Claude Desktop / Claude Code / Cursor 等）'),
    h('pre', {}, JSON.stringify({ mcpServers: { 'pixel-studio': { type: 'http', url: `${base}/mcp`, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)),
    h('p', { class: 'small' }, 'Claude Code：', h('code', {}, `claude mcp add --transport http pixel-studio ${base}/mcp --header "Authorization: Bearer ${key}"`)),
    h('p', { class: 'small' }, '文件：', h('a', { href: 'docs', target: '_blank' }, '/docs'), '　OpenAPI：', h('a', { href: 'api/openapi.json', target: '_blank' }, '/api/openapi.json'),
      '　注意：雲端 AI（如 ChatGPT 網頁版）無法連到你的區網位址，需要公開網址（例如 Cloudflare Tunnel）；本機的 Claude Desktop / Claude Code 可直接用 localhost。'));
}
function connectTab(el) { el.append(connectSnippets()); }

async function activityTab(el) {
  const onlyCur = h('input', { type: 'checkbox', checked: true });
  const list = h('div', {});
  const load = async () => {
    list.innerHTML = '';
    try {
      const q = onlyCur.checked ? `?projectId=${app.doc.meta.id}` : '';
      const { activity } = await api('GET', 'api/owner/activity' + q);
      if (!activity.length) { list.append(h('p', { class: 'small' }, '尚無紀錄')); return; }
      const t = h('table', { class: 't' }, h('tr', {}, h('th', {}, '時間'), h('th', {}, '金鑰'), h('th', {}, '動作'), h('th', {}, '內容'), h('th', {})));
      for (const e of activity) {
        t.append(h('tr', { style: { opacity: e.reverted ? 0.5 : 1 } },
          h('td', {}, new Date(e.time).toLocaleString()), h('td', {}, e.keyName), h('td', {}, h('code', {}, e.action), h('div', { class: 'small' }, e.via)),
          h('td', {}, e.summary, e.reverted ? h('div', { class: 'small' }, '已還原') : ''),
          h('td', {}, e.write && e.hasUndo && !e.reverted ? h('button', { class: 'sb', onclick: async () => {
            if (!(await confirmBox('還原 AI 動作', `還原「${e.keyName}：${e.summary}」？之後對相同 cel 的修改也可能一併被還原。`, '還原'))) return;
            try { await api('POST', `api/owner/activity/${e.id}/revert`); toast('已還原'); load(); } catch (err) { toast(err.message); }
          } }, '還原') : '')));
      }
      list.append(t);
    } catch (e) { list.append(h('p', {}, e.message)); }
  };
  el.append(h('div', { class: 'row' }, h('label', {}, onlyCur, ' 只顯示目前專案'), h('button', { class: 'sb', onclick: load }, '重新整理')), list);
  onlyCur.onchange = load;
  load();
  const off = on('activity', () => { if (!el.isConnected) return off(); load(); });
}

// ---------- shortcuts ----------
export function shortcutsDialog() {
  const rows = [
    ['B', '鉛筆'], ['E', '橡皮擦'], ['G', '油漆桶'], ['I', '滴管（Alt 暫時切換）'], ['L', '直線'], ['U / Shift+U', '矩形 / 橢圓'], ['M', '矩形選取'], ['Q', '套索選取'], ['V', '移動（Ctrl 暫時切換）'], ['H / 空白鍵拖曳 / 中鍵', '平移畫面'],
    ['X', '交換主要 / 次要顏色'], ['[ / ]', '筆刷大小'], ['Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z', '復原 / 重做'], ['Ctrl+C / X / V', '複製 / 剪下 / 貼上'], ['Delete', '刪除選取內容（無選取時清除 cel）'],
    ['Ctrl+A / Ctrl+D / Ctrl+Shift+I', '全選 / 取消選取 / 反選'], ['Enter / Esc', '確定 / 取消浮動選取'], ['方向鍵', '移動選取內容 1px'], ['Shift+H / Shift+V', '水平 / 垂直翻轉選取'],
    [', / .', '上一格 / 下一格'], ['Enter（無選取）', '播放 / 暫停'], ['Alt+N / Alt+D', '新增影格 / 複製影格'], ['Shift+N', '新增圖層'], ['Ctrl+E', '向下合併'], ['F3', '洋蔥皮'],
    ['滾輪 / 觸控板捏合', '縮放'], ['+ / - / 0', '放大 / 縮小 / 符合視窗'], ["Ctrl+'", '像素格線'], ['Ctrl+S / Ctrl+Shift+S', '儲存 / 下載 .pxs'], ['Ctrl+Shift+E', '匯出'], ['Ctrl+N / Ctrl+O', '新增 / 開啟'],
    ['雙指點按 / 三指點按', '（觸控）復原 / 重做'], ['雙指捏合拖曳', '（觸控）縮放平移'],
  ];
  modal({ title: '快捷鍵', wide: true, body: h('table', { class: 't' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, v)))) });
}
