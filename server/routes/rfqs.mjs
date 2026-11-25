import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'rfqs';

const key = (id, version) => `${id}::${version}`;

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    cache.set(COLLECTION, rows);
  }
  return rows;
}

// GET /api/rfqs
router.get('/', (_req, res) => {
  res.json({ data: getAll(), error: null });
});

// POST /api/rfqs  (upsert by id+version)
router.post('/', (req, res) => {
  const r = req.body;
  if (!r?.id || !r?.version) return res.status(400).json({ error: 'id and version required' });
  SqliteStore.upsert(COLLECTION, r, { id: r.id, version: r.version, status: r.status ?? null, created_at: r.created_at ?? null });
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: r });
  res.json({ data: r, error: null });
});

// DELETE /api/rfqs/:id/:version
router.delete('/:id/:version', (req, res) => {
  const { id, version } = req.params;
  const rows = getAll();
  const exists = rows.some((r) => key(r.id, r.version) === key(id, version));
  if (exists) {
    // rfqs uses composite PK (id+version) — filter in JS then writeAll
    const next = rows.filter((r) => key(r.id, r.version) !== key(id, version));
    SqliteStore.writeAll(COLLECTION, next, (r) => ({ id: r.id, version: r.version, status: r.status ?? null, created_at: r.created_at ?? null }));
    cache.invalidate(COLLECTION);
    SseBroadcaster.broadcast({ collection: COLLECTION, action: 'delete', id, version });
  }
  res.json({ data: null, meta: { deleted: exists }, error: null });
});

// POST /api/rfqs/batch-delete
router.post('/batch-delete', (req, res) => {
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
  const keys = new Set(selections.map((s) => key(s.id, s.version)));
  const rows = getAll();
  const next = rows.filter((r) => !keys.has(key(r.id, r.version)));
  SqliteStore.writeAll(COLLECTION, next, (r) => ({ id: r.id, version: r.version, status: r.status ?? null, created_at: r.created_at ?? null }));
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'batch-delete', count: rows.length - next.length });
  res.json({ data: null, meta: { deletedCount: rows.length - next.length }, error: null });
});

export default router;
