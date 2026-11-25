import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { LruCache } from '../cache/LruCache.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const cache = new LruCache(1);
const COLLECTION = 'roles';

const DEFAULT_ROLES = [
  { id: 'admin', name: 'Admin', permissions: { canEditRFQ: true, canDeleteRFQ: true, canManageUsers: true, canManageRoles: true, canAccessAuditLog: true, canViewMaterials: true, canEditMaterials: true, canManageBOM: true, canViewRFQ: true, canViewBOM: true, canViewPrices: true, canApproveLevel1: true, canApproveLevel2: true, canApproveLevel3: true, canFinalizeApproval: true, canRejectRFQ: true } },
  { id: 'pm', name: 'PM', permissions: { canEditRFQ: true, canDeleteRFQ: false, canManageUsers: false, canManageRoles: false, canAccessAuditLog: true, canViewMaterials: true, canEditMaterials: true, canManageBOM: true, canViewRFQ: true, canViewBOM: true, canViewPrices: true, canApproveLevel1: true, canApproveLevel2: false, canApproveLevel3: false, canFinalizeApproval: false, canRejectRFQ: true } },
  { id: 'user', name: 'User', permissions: { canEditRFQ: true, canDeleteRFQ: false, canManageUsers: false, canManageRoles: false, canAccessAuditLog: true, canViewMaterials: true, canEditMaterials: true, canManageBOM: false, canViewRFQ: true, canViewBOM: true, canViewPrices: true, canApproveLevel1: false, canApproveLevel2: false, canApproveLevel3: false, canFinalizeApproval: false, canRejectRFQ: false } },
  { id: 'viewer', name: 'Viewer', permissions: { canEditRFQ: false, canDeleteRFQ: false, canManageUsers: false, canManageRoles: false, canAccessAuditLog: false, canViewMaterials: true, canEditMaterials: false, canManageBOM: false, canViewRFQ: true, canViewBOM: true, canViewPrices: false, canApproveLevel1: false, canApproveLevel2: false, canApproveLevel3: false, canFinalizeApproval: false, canRejectRFQ: false } }
];

function getAll() {
  let rows = cache.get(COLLECTION);
  if (!rows) {
    rows = SqliteStore.readAll(COLLECTION);
    if (!rows.length) {
      SqliteStore.writeAll(COLLECTION, DEFAULT_ROLES, (r) => ({ id: r.id }));
      rows = DEFAULT_ROLES;
    }
    cache.set(COLLECTION, rows);
  }
  return rows;
}

router.get('/', (_req, res) => {
  res.json({ data: getAll(), error: null });
});

router.post('/', (req, res) => {
  const role = req.body;
  if (!role?.id) return res.status(400).json({ error: 'id required' });
  SqliteStore.upsert(COLLECTION, role, { id: role.id });
  cache.invalidate(COLLECTION);
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: role });
  res.json({ data: role, error: null });
});

router.delete('/:id', (req, res) => {
  const deleted = SqliteStore.remove(COLLECTION, 'id', req.params.id);
  cache.invalidate(COLLECTION);
  if (deleted) SseBroadcaster.broadcast({ collection: COLLECTION, action: 'delete', id: req.params.id });
  res.json({ data: null, meta: { deleted: deleted > 0 }, error: null });
});

export default router;
