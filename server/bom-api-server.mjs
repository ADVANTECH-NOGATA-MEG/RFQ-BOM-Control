import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'boms.json');
const PORT = Number(process.env.BOM_API_PORT || 3000);
const HOST = process.env.BOM_API_HOST || '0.0.0.0';

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
};

const sendNoContent = (res) => {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
};

const ensureStore = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]\n', 'utf8');
  }
};

const readStore = async () => {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const writeStore = async (rows) => {
  await ensureStore();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};

const normalizeItems = (items) => {
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return Object.values(items);
  return [];
};

const normalizeBom = (payload = {}) => ({
  id: String(payload.id || '').trim(),
  name: String(payload.name || '').trim(),
  top_part_no: String(payload.top_part_no || payload.topPartNo || '').trim(),
  description: String(payload.description || '').trim(),
  version: String(payload.version || 'V1').trim(),
  status: String(payload.status || 'Prototype').trim(),
  items: normalizeItems(payload.items),
  change_log: Array.isArray(payload.change_log)
    ? payload.change_log
    : Array.isArray(payload.changeLog)
      ? payload.changeLog
      : [],
  saved_by: String(payload.saved_by || payload.savedBy || 'system').trim(),
  updated_at: new Date().toISOString()
});

const validateBom = (bom) => {
  if (!bom.id) return 'id is required';
  if (!bom.top_part_no) return 'top_part_no is required';
  if (!Array.isArray(bom.items)) return 'items must be an array';
  return null;
};

const getBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/boms/count') {
      const rows = await readStore();
      sendJson(res, 200, { count: rows.length });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        data: { ok: true, service: 'rfq-bom-api', ts: new Date().toISOString() },
        meta: { source: 'local-json' },
        error: null
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/boms') {
      const rows = await readStore();
      const keyword = String(url.searchParams.get('keyword') || '').trim().toLowerCase();
      const filtered = keyword
        ? rows.filter((bom) =>
            [bom.id, bom.name, bom.top_part_no, bom.description].some((field) =>
              String(field || '').toLowerCase().includes(keyword)
            )
          )
        : rows;

      sendJson(res, 200, {
        data: filtered,
        meta: {
          total: filtered.length,
          source: 'local-json',
          as_of: new Date().toISOString()
        },
        error: null
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/boms') {
      const rows = await readStore();
      const keyword = String(url.searchParams.get('keyword') || '').trim().toLowerCase();
      const filtered = keyword
        ? rows.filter((bom) =>
            [bom.id, bom.name, bom.top_part_no, bom.description].some((field) =>
              String(field || '').toLowerCase().includes(keyword)
            )
          )
        : rows;

      sendJson(res, 200, {
        data: filtered,
        meta: {
          total: filtered.length,
          source: 'local-json',
          as_of: new Date().toISOString()
        },
        error: null
      });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/boms/')) {
      const id = decodeURIComponent(pathname.replace('/boms/', ''));
      const rows = await readStore();
      const match = rows.find((bom) => bom.id === id);
      if (!match) {
        sendJson(res, 404, { data: null, meta: null, error: `BOM ${id} not found` });
        return;
      }
      sendJson(res, 200, {
        data: match,
        meta: {
          source: 'local-json',
          as_of: new Date().toISOString()
        },
        error: null
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/boms') {
      const payload = normalizeBom(await getBody(req));
      const validationError = validateBom(payload);
      if (validationError) {
        sendJson(res, 400, { data: null, meta: null, error: validationError });
        return;
      }

      const rows = await readStore();
      const index = rows.findIndex((bom) => bom.id === payload.id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...payload };
      } else {
        rows.push(payload);
      }
      await writeStore(rows);
      sendJson(res, 200, {
        data: payload,
        meta: { saved: true },
        error: null
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/boms/import') {
      const body = await getBody(req);
      const incoming = Array.isArray(body?.boms) ? body.boms : [];
      const payloads = incoming.map(normalizeBom);
      const validationError = payloads.find((bom) => validateBom(bom));
      if (validationError) {
        sendJson(res, 400, { data: null, meta: null, error: validateBom(validationError) });
        return;
      }

      const rows = await readStore();
      const rowMap = new Map(rows.map((bom) => [bom.id, bom]));
      payloads.forEach((bom) => {
        rowMap.set(bom.id, {
          ...(rowMap.get(bom.id) || {}),
          ...bom
        });
      });

      const mergedRows = Array.from(rowMap.values());
      await writeStore(mergedRows);
      sendJson(res, 200, {
        data: payloads,
        meta: { saved: true, importedCount: payloads.length },
        error: null
      });
      return;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/boms/')) {
      const id = decodeURIComponent(pathname.replace('/boms/', ''));
      const rows = await readStore();
      const next = rows.filter((bom) => bom.id !== id);
      await writeStore(next);
      sendJson(res, 200, {
        data: null,
        meta: { deleted: rows.length - next.length > 0 },
        error: null
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/boms/batch-delete') {
      const body = await getBody(req);
      const ids = Array.isArray(body?.ids) ? body.ids.map((id) => String(id)) : [];
      const rows = await readStore();
      const next = rows.filter((bom) => !ids.includes(bom.id));
      await writeStore(next);
      sendJson(res, 200, {
        data: null,
        meta: { deletedCount: rows.length - next.length },
        error: null
      });
      return;
    }

    sendJson(res, 404, { data: null, meta: null, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, {
      data: null,
      meta: null,
      error: error?.message || 'Internal server error'
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bom-api] listening on http://${HOST}:${PORT}`);
  console.log(`[bom-api] data file: ${DATA_FILE}`);
});
