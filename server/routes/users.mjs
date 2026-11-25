import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'users';

const DEFAULT_ADMIN = {
  id: 'usr-admin',
  name: 'Administrator',
  username: 'admin',
  email: '',
  password: btoa('admin'),
  role: 'admin',
  created_at: new Date().toISOString()
};

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    if (!rows.length) {
      SqliteStore.upsert(COLLECTION, DEFAULT_ADMIN, { id: DEFAULT_ADMIN.id });
      rows = [DEFAULT_ADMIN];
    }
    cache.set(COLLECTION, rows);
  }
  return rows;
}

// never expose credential material to clients
const sanitize = (u) => {
  if (!u) return u;
  const { password: _password, ...rest } = u;
  return rest;
};

router.get('/', (_req, res) => {
  res.json({ data: getAll().map(sanitize), error: null });
});

// server-side credential check; password field never leaves the server
router.post('/authenticate', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const encoded = Buffer.from(String(req.body?.password || '').trim(), 'utf8').toString('base64');
  const found = getAll().find(
    (u) => String(u.username || '').trim().toLowerCase() === username && u.password === encoded
  );
  res.json({ data: found ? sanitize(found) : null, error: null });
});

router.post('/', (req, res) => {
  const user = req.body;
  if (!user?.id || !user?.username) return res.status(400).json({ error: 'id and username required' });
  // preserve stored password when client omits it (clients no longer receive it)
  if (!user.password) {
    const existing = getAll().find((u) => u.id === user.id);
    if (existing?.password) user.password = existing.password;
  }
  SqliteStore.upsert(COLLECTION, user, { id: user.id });
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: sanitize(user) });
  res.json({ data: sanitize(user), error: null });
});

router.delete('/:id', (req, res) => {
  const rows = getAll();
  const target = rows.find((u) => u.id === req.params.id);
  const adminCount = rows.filter((u) => u.role === 'admin').length;
  if (target?.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ data: null, error: 'cannot delete the last admin account' });
  }
  const deleted = SqliteStore.remove(COLLECTION, 'id', req.params.id);
  cache.invalidate(COLLECTION);
  if (deleted) SseBroadcaster.broadcast({ collection: COLLECTION, action: 'delete', id: req.params.id });
  res.json({ data: null, meta: { deleted: deleted > 0 }, error: null });
});

export default router;
