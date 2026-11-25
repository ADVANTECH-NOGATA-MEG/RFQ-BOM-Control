import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'materials';

const CONFLICT_FIELDS = ['description', 'currentPrice', 'currency', 'vendor', 'category'];

const toExtraCols = (m) => ({ partNo: m.partNo, code: m.partNo ?? null });

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    cache.set(COLLECTION, rows);
  }
  return rows;
}

function detectConflicts(existing, incoming) {
  const map = new Map(existing.map((r) => [r.partNo, r]));
  const toAdd = [], toUpdate = [], conflicts = [];
  for (const item of incoming) {
    const current = map.get(item.partNo);
    if (!current) {
      toAdd.push(item);
    } else {
      const changed = CONFLICT_FIELDS.filter((f) => {
        const a = String(current[f] ?? '').trim();
        const b = String(item[f] ?? '').trim();
        return a !== b && b !== '';
      });
      if (changed.length > 0) {
        conflicts.push({ partNo: item.partNo, current, incoming: item, changedFields: changed });
      } else {
        toUpdate.push(item);
      }
    }
  }
  return { toAdd, toUpdate, conflicts };
}

const SORTERS = {
  'date-desc': (a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')),
  'date-asc': (a, b) => String(a.updatedAt || a.updated_at || '').localeCompare(String(b.updatedAt || b.updated_at || '')),
  'mpn-asc': (a, b) => String(a.mpn || a.partNo || '').localeCompare(String(b.mpn || b.partNo || '')),
  'mpn-desc': (a, b) => String(b.mpn || b.partNo || '').localeCompare(String(a.mpn || a.partNo || '')),
  'price-desc': (a, b) => (Number(b.currentPrice) || 0) - (Number(a.currentPrice) || 0),
  'price-asc': (a, b) => (Number(a.currentPrice) || 0) - (Number(b.currentPrice) || 0),
};

// GET /api/materials
router.get('/', (req, res) => {
  const rows = getAll();
  const kw = String(req.query.keyword || '').trim().toLowerCase();
  let filtered = kw
    ? rows.filter((r) =>
        [r.partNo, r.mpn, r.description, r.vendor, r.category].some((f) =>
          String(f || '').toLowerCase().includes(kw)
        )
      )
    : rows;
  const sorter = SORTERS[String(req.query.sortBy || '')];
  if (sorter) filtered = [...filtered].sort(sorter);
  const pageNum = Number(req.query.page);
  const sizeNum = Number(req.query.pageSize);
  const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
  const pageSize = Math.min(500, Math.max(1, Number.isFinite(sizeNum) ? sizeNum : 50));
  const start = (page - 1) * pageSize;
  res.json({
    data: filtered.slice(start, start + pageSize),
    meta: { total: filtered.length, page, pageSize },
    error: null
  });
});

// POST /api/materials  (upsert single)
router.post('/', (req, res) => {
  const m = req.body;
  if (!m?.partNo) return res.status(400).json({ error: 'partNo required' });
  const record = { ...m, updatedAt: new Date().toISOString() };
  SqliteStore.upsert(COLLECTION, record, toExtraCols(record));
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: record });
  res.json({ data: m, error: null });
});

// POST /api/materials/preview-merge
router.post('/preview-merge', (req, res) => {
  const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
  const existing = getAll();
  res.json({ data: detectConflicts(existing, incoming), error: null });
});

// POST /api/materials/import
router.post('/import', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const existing = getAll();
  const map = new Map(existing.map((r) => [r.partNo, r]));
  const now = new Date().toISOString();
  items.forEach((m) => {
    if (!m?.partNo) return;
    map.set(m.partNo, { ...(map.get(m.partNo) || {}), ...m, updatedAt: now });
  });
  SqliteStore.writeAll(COLLECTION, Array.from(map.values()), toExtraCols);
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'import', count: items.length });
  res.json({ data: null, meta: { importedCount: items.length }, error: null });
});

// DELETE /api/materials/:partNo
router.delete('/:partNo', (req, res) => {
  const deleted = SqliteStore.remove(COLLECTION, 'partNo', decodeURIComponent(req.params.partNo));
  cache.invalidate(COLLECTION);
  if (deleted) SseBroadcaster.broadcast({ collection: COLLECTION, action: 'delete', partNo: req.params.partNo });
  res.json({ data: null, meta: { deleted: deleted > 0 }, error: null });
});

// POST /api/materials/batch-delete
router.post('/batch-delete', (req, res) => {
  const partNos = Array.isArray(req.body?.partNos) ? req.body.partNos.map(String) : [];
  const rows = getAll();
  const next = rows.filter((r) => !partNos.includes(String(r.partNo)));
  SqliteStore.writeAll(COLLECTION, next, toExtraCols);
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'batch-delete', count: rows.length - next.length });
  res.json({ data: null, meta: { deletedCount: rows.length - next.length }, error: null });
});

// POST /api/materials/clear
router.post('/clear', (_req, res) => {
  SqliteStore.writeAll(COLLECTION, []);
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'clear' });
  res.json({ data: null, meta: { cleared: true }, error: null });
});

export default router;
