import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';

const router = Router();

const CLOSED_STATUSES = new Set(['approved', 'rejected', 'closed']);
const normalizeStatus = (status) => {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'submitted' || s === 'pending') return 'submitted_l1';
  return s;
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const buildOverview = (rfqs = []) => {
  const now = Date.now();
  const rows = rfqs.map((r) => ({ ...r, status: normalizeStatus(r.status) }));
  const total = rows.length;
  const closed = rows.filter((r) => CLOSED_STATUSES.has(r.status)).length;
  const overdue = rows.filter((r) => {
    const ts = new Date(r.timestamp).getTime();
    return Number.isFinite(ts) && now - ts > 7 * 86400000 && !CLOSED_STATUSES.has(r.status);
  }).length;

  const margins = rows.map((r) => toNum(r.marginPct, null)).filter((v) => v !== null);
  const avgMarginPct = margins.length ? Number((margins.reduce((s, n) => s + n, 0) / margins.length).toFixed(2)) : 0;

  return {
    kpis: {
      rfqTotal: total,
      overdue,
      weeklyCloseRate: total ? Math.round((closed / total) * 100) : 0,
    },
    quality: {
      avgMarginPct,
      missingKeyFields: rows.filter((r) => !r.id || !r.version || !r.bomPartNo).length,
    },
    risk: {
      overdue,
      lowMarginCount: margins.filter((m) => m < 10).length,
      pendingApprovals: rows.filter((r) => ['submitted_l1', 'submitted_l2', 'submitted_l3'].includes(r.status)).length,
    },
  };
};

router.get('/overview', async (_req, res) => {
  const rfqs = SqliteStore.readAll('rfqs');
  res.json({ data: buildOverview(rfqs), error: null });
});

router.get('/risk', async (_req, res) => {
  const rfqs = SqliteStore.readAll('rfqs');
  res.json({ data: buildOverview(rfqs).risk, error: null });
});

router.get('/quality', async (_req, res) => {
  const rfqs = SqliteStore.readAll('rfqs');
  res.json({ data: buildOverview(rfqs).quality, error: null });
});

export default router;
