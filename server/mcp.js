// Minimal MCP server over Streamable HTTP (stateless JSON responses).
// POST /mcp with JSON-RPC 2.0. Authenticated with the same API key (Authorization: Bearer pxs_...).
import crypto from 'node:crypto';
import { OPS, runOp, ApiError } from './ops.js';
import { findKey } from './store.js';

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

function toolList(key) {
  return OPS.map((op) => {
    const schema = JSON.parse(JSON.stringify(op.input));
    delete schema.properties.format;
    return {
      name: op.name,
      title: op.name.replace(/_/g, ' '),
      description: `${op.description}（需要權限: ${op.scope}${key.scopes.includes(op.scope) ? '' : '，此金鑰未授權'}）`,
      inputSchema: schema,
      annotations: { readOnlyHint: !op.write, destructiveHint: false, idempotentHint: !op.write },
    };
  });
}

async function handleRpc(msg, key, hub) {
  const { id, method, params } = msg || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid Request');
  const isNotification = id === undefined || id === null;
  try {
    switch (method) {
      case 'initialize': {
        const v = SUPPORTED.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED[0];
        return reply({
          protocolVersion: v,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'pixel-studio', title: 'Pixel Studio', version: '0.1.0' },
          instructions: 'Pixel Studio 像素繪圖工具。先呼叫 list_projects / get_project_overview，再用 get_frame_image 觀看畫面、get_reference_images 觀看設計稿，最後用 draw_pixels / draw_shape / fill / paste_image / add_frame 等工具作畫。座標原點在左上角。沒有任何刪除功能。',
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: toolList(key) });
      case 'tools/call': {
        const name = params?.name;
        try {
          const out = runOp(name, params?.arguments || {}, key, hub, 'mcp');
          const content = [];
          const res = { ...(out.result || {}) };
          content.push({ type: 'text', text: JSON.stringify(stripData(res), null, 1) });
          if (out.image) content.push({ type: 'image', data: Buffer.from(out.image).toString('base64'), mimeType: 'image/png' });
          for (const img of out.images || []) content.push({ type: 'image', data: Buffer.from(img.data).toString('base64'), mimeType: img.mime });
          return reply({ content, isError: false });
        } catch (e) {
          if (e instanceof ApiError) return reply({ content: [{ type: 'text', text: `錯誤 ${e.status} ${e.code}: ${e.message}` }], isError: true });
          throw e;
        }
      }
      case 'resources/list': return reply({ resources: [] });
      case 'prompts/list': return reply({ prompts: [] });
      default:
        if (isNotification) return null;
        return fail(-32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return fail(-32603, e.message || 'Internal error');
  }
}

// Don't echo big data URLs into the text part (the images are attached separately)
function stripData(res) {
  if (res.references) res.references = res.references.map(({ dataUrl, ...r }) => ({ ...r, attached: !!dataUrl }));
  return res;
}

export function mountMcp(app, hub) {
  app.post('/mcp', async (req, res) => {
    const auth = req.headers.authorization || '';
    const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers['x-api-key'] || '');
    const key = findKey(raw);
    if (!key) {
      res.set('WWW-Authenticate', 'Bearer realm="pixel-studio"');
      return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: 需要有效的 API 金鑰（Authorization: Bearer pxs_...）' } });
    }
    const body = req.body;
    const batch = Array.isArray(body);
    const msgs = batch ? body : [body];
    const out = [];
    for (const m of msgs) {
      const r = await handleRpc(m, key, hub);
      if (r) out.push(r);
    }
    if (msgs.some((m) => m?.method === 'initialize')) res.set('Mcp-Session-Id', crypto.randomUUID());
    if (!out.length) return res.status(202).end();
    res.json(batch ? out : out[0]);
  });
  app.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: '此 MCP 伺服器為無狀態模式，請使用 POST' }));
  app.delete('/mcp', (_req, res) => res.status(200).end());
}
