import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'audit';

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    cache.set(COLLECTION, rows);
  }
  return rows;
}

router.get('/', (req, res) => {
  const { user, action, dateFrom, dateTo } = req.query;
  let filtered = getAll();
  if (user) filtered = filtered.filter((r) => String(r.user_name || '').toLowerCase().includes(String(user).toLowerCase()));
  if (action && action !== 'All') filtered = filtered.filter((r) => r.action === action);
  if (dateFrom) {
    const dFrom = new Date(dateFrom);
    if (Number.isFinite(dFrom.getTime())) {
      filtered = filtered.filter((r) => r.timestamp >= dFrom.toISOString());
    }
  }
  if (dateTo) {
    const dTo = new Date(dateTo);
    if (Number.isFinite(dTo.getTime())) {
      dTo.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => r.timestamp <= dTo.toISOString());
    }
  }
  filtered = [...filtered].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  res.json({ data: filtered, error: null });
});

router.post('/', (req, res) => {
  const log = req.body;
  if (!log?.id) return res.status(400).json({ error: 'id required' });
  SqliteStore.upsert(COLLECTION, log, { id: log.id, created_at: log.timestamp ?? null });
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: log });
  res.json({ data: log, error: null });
});

export default router;
