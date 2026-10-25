import { OPS } from './ops.js';
import { SCOPES } from './store.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function oaSchema(s) {
  // OpenAPI 3.0 doesn't support type arrays → use oneOf
  if (!s || typeof s !== 'object') return s;
  const out = Array.isArray(s) ? s.map(oaSchema) : {};
  if (Array.isArray(s)) return out;
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type' && Array.isArray(v)) out.oneOf = v.map((t) => ({ type: t }));
    else out[k] = typeof v === 'object' ? oaSchema(v) : v;
  }
  if (out.items && Object.keys(out.items).length === 0) out.items = {};
  return out;
}

export function buildOpenApi(baseUrl) {
  const paths = {};
  for (const op of OPS) {
    const p = '/api/v1' + op.path;
    const props = { ...op.input.properties };
    delete props.projectId;
    const params = [];
    if (op.path.includes('{projectId}')) params.push({ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } });
    const item = {
      operationId: op.name,
      summary: op.description,
      tags: [op.write ? '寫入' : '讀取'],
      security: [{ apiKey: [op.scope] }],
      'x-required-scope': op.scope,
      parameters: params,
      responses: {
        200: op.image
          ? { description: 'PNG 圖片（或 format=base64 時為 JSON）', content: { 'image/png': {}, 'application/json': {} } }
          : { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
        400: { description: '參數錯誤' }, 401: { description: '缺少或無效的 API 金鑰' },
        403: { description: '權限不足 / 禁止刪除' }, 404: { description: '找不到' }, 423: { description: '圖層已鎖定' }, 429: { description: '超過速率限制' },
      },
    };
    if (op.method === 'GET') {
      for (const [name, schema] of Object.entries(props)) params.push({ name, in: 'query', required: false, schema: oaSchema(schema), description: schema.description });
    } else {
      item.requestBody = { required: true, content: { 'application/json': { schema: oaSchema({ ...op.input, properties: props }) } } };
    }
    paths[p] = paths[p] || {};
    paths[p][op.method.toLowerCase()] = item;
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Pixel Studio AI API',
      version: '0.1.0',
      description: '讓 AI 代理讀取與繪製 Pixel Studio 專案。所有 DELETE 請求一律回傳 403：API 金鑰沒有任何刪除能力（無法刪除專案、圖層、影格、cel，也無法清空整個 cel）。同樣的工具也透過 MCP（POST /mcp）提供。',
    },
    servers: [{ url: baseUrl || '/' }],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer pxs_...。權限範圍：' + Object.entries(SCOPES).map(([k, v]) => `${k}（${v}）`).join('、') },
      },
    },
    paths,
  };
}

export function docsPage(baseUrl) {
  const rows = OPS.map((op) => {
    const props = Object.entries(op.input.properties).filter(([k]) => k !== 'format')
      .map(([k, v]) => `<li><code>${k}</code>${(op.input.required || []).includes(k) ? ' <b>必填</b>' : ''} — ${esc(v.description || (v.enum ? v.enum.join(' | ') : Array.isArray(v.type) ? v.type.join('|') : v.type || ''))}</li>`).join('');
    return `<section><h3 id="${op.name}"><code>${op.name}</code></h3>
<p><span class="m ${op.method}">${op.method}</span> <code>/api/v1${op.path}</code> · 權限 <code>${op.scope}</code></p>
<p>${esc(op.description)}</p>${props ? `<ul>${props}</ul>` : ''}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pixel Studio AI API 文件</title>
<style>body{font:15px/1.6 system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;max-width:900px;margin:0 auto;padding:24px;background:#16161d;color:#e6e6ef}
a{color:#8ab4ff}code,pre{background:#24243a;border-radius:4px;padding:1px 5px;font-family:ui-monospace,Consolas,monospace}pre{padding:12px;overflow:auto}
section{border-top:1px solid #333;padding-top:8px}.m{font-weight:700;padding:1px 6px;border-radius:4px}.GET{background:#2d5a3d}.POST{background:#2d3f5a}
.warn{background:#4a2a2a;padding:10px;border-radius:6px}</style></head><body>
<h1>Pixel Studio AI API</h1>
<p>機器可讀規格：<a href="/api/openapi.json">/api/openapi.json</a>（OpenAPI 3）。MCP 端點：<code>POST ${esc(baseUrl)}/mcp</code>（Streamable HTTP，同一把 API 金鑰）。</p>
<p class="warn">🔒 API 金鑰<b>沒有任何刪除能力</b>：無法刪除專案、圖層、影格或 cel，也無法清空整個 cel。伺服器端強制執行，所有 DELETE 請求回傳 403。被鎖定的圖層也無法寫入（423）。每把金鑰有速率限制，每個動作都會記錄在擁有者的活動紀錄中，擁有者可以還原。</p>
<h2>驗證</h2>
<p>在 App 的「設定 → API 金鑰」建立金鑰，然後在每個請求加上 <code>Authorization: Bearer pxs_...</code>。</p>
<h2>範例</h2>
<pre>KEY=pxs_xxx
BASE=${esc(baseUrl)}
curl -H "Authorization: Bearer $KEY" $BASE/api/v1/projects
curl -H "Authorization: Bearer $KEY" "$BASE/api/v1/projects/PROJECT_ID/image?frame=0&amp;scale=8" -o frame0.png
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"layer":0,"frame":0,"color":"#ff004d","points":[[1,1],[2,1],[3,1]]}' \\
  $BASE/api/v1/projects/PROJECT_ID/draw/pixels</pre>
<h2>MCP 設定範例</h2>
<pre>{
  "mcpServers": {
    "pixel-studio": {
      "type": "http",
      "url": "${esc(baseUrl)}/mcp",
      "headers": { "Authorization": "Bearer pxs_xxx" }
    }
  }
}</pre>
<h2>權限範圍</h2><ul>${Object.entries(SCOPES).map(([k, v]) => `<li><code>${k}</code> — ${esc(v)}</li>`).join('')}</ul>
<h2>工具 / 端點</h2>
<p>REST：GET 的參數放在 query string；POST 的參數放在 JSON body。<code>layer</code> 可用索引（0 = 最底層）、ID 或名稱；<code>frame</code> 用索引（0 起算）或 ID。</p>
${rows}
</body></html>`;
}
