import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'boms';

const normalizeBom = (p = {}) => ({
  id: String(p.id || '').trim(),
  name: String(p.name || '').trim(),
  top_part_no: String(p.top_part_no || p.topPartNo || '').trim(),
  description: String(p.description || '').trim(),
  version: String(p.version || 'V1').trim(),
  status: String(p.status || 'Prototype').trim(),
  items: Array.isArray(p.items) ? p.items : [],
  change_log: Array.isArray(p.change_log || p.changeLog) ? (p.change_log || p.changeLog) : [],
  saved_by: String(p.saved_by || p.savedBy || 'system').trim(),
  updated_at: new Date().toISOString()
});

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    cache.set(COLLECTION, rows);
  }
  return rows;
}

const toExtraCols = (b) => ({ id: b.id, rfq_id: b.rfq_id ?? null });

// GET /api/boms
router.get('/', (req, res) => {
  const rows = getAll();
  const kw = String(req.query.keyword || '').trim().toLowerCase();
  const filtered = kw
    ? rows.filter((b) => [b.id, b.name, b.top_part_no, b.description].some((f) => String(f || '').toLowerCase().includes(kw)))
    : rows;
  res.json({ data: filtered, meta: { total: filtered.length }, error: null });
});

// GET /api/boms/count
router.get('/count', (_req, res) => {
  res.json({ count: getAll().length });
});

// GET /api/boms/:id
router.get('/:id', (req, res) => {
  const match = getAll().find((b) => b.id === decodeURIComponent(req.params.id));
  if (!match) return res.status(404).json({ data: null, error: 'Not found' });
  res.json({ data: match, error: null });
});

// POST /api/boms
router.post('/', (req, res) => {
  const bom = normalizeBom(req.body);
  if (!bom.id || !bom.top_part_no) return res.status(400).json({ error: 'id and top_part_no required' });
  SqliteStore.upsert(COLLECTION, bom, toExtraCols(bom));
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: bom });
  res.json({ data: bom, error: null });
});

// POST /api/boms/import
router.post('/import', (req, res) => {
  const incoming = Array.isArray(req.body?.boms) ? req.body.boms : [];
  const boms = incoming.map(normalizeBom).filter((b) => b.id && b.top_part_no);
  const rows = getAll();
  const map = new Map(rows.map((b) => [b.id, b]));
  boms.forEach((b) => map.set(b.id, { ...(map.get(b.id) || {}), ...b }));
  SqliteStore.writeAll(COLLECTION, Array.from(map.values()), toExtraCols);
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'import', count: boms.length });
  res.json({ data: boms, meta: { importedCount: boms.length }, error: null });
});

// DELETE /api/boms/:id
router.delete('/:id', (req, res) => {
  const deleted = SqliteStore.remove(COLLECTION, 'id', decodeURIComponent(req.params.id));
  cache.invalidate(COLLECTION);
  if (deleted) SseBroadcaster.broadcast({ collection: COLLECTION, action: 'delete', id: req.params.id });
  res.json({ data: null, meta: { deleted: deleted > 0 }, error: null });
});

// POST /api/boms/batch-delete
router.post('/batch-delete', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const rows = getAll();
  const next = rows.filter((b) => !ids.includes(b.id));
  SqliteStore.writeAll(COLLECTION, next, toExtraCols);
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'batch-delete', count: rows.length - next.length });
  res.json({ data: null, meta: { deletedCount: rows.length - next.length }, error: null });
});

export default router;
