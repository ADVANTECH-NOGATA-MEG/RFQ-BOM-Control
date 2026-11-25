import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';

const router = Router();

router.post('/anomaly-check', (req, res) => {
  const payload = req.body || {};
  const marginPct = Number(payload.marginPct || 0);
  const amount = Number(payload.amount || 0);
  const floor = Number(payload.floor || 10);
  const highValue = Number(payload.highValue || 100000);
  const alert = marginPct < floor && amount >= highValue;
  res.json({
    data: {
      alert,
      reasons: alert ? ['low_margin_high_value'] : [],
    },
    error: null,
  });
});

router.post('/mutation-guard', (req, res) => {
  const rfq = req.body?.rfq || {};
  const actor = req.body?.actor || {};
  const mutation = req.body?.mutation || {};
  const status = String(rfq.status || '').toLowerCase();
  const immutable = status === 'approved' || status === 'closed';
  const isAdmin = String(actor.role || '').toLowerCase() === 'admin';
  if (immutable && !isAdmin) {
    return res.json({ data: { allowed: false, reason: 'approved_record_locked' }, error: null });
  }
  if (!mutation?.reason || String(mutation.reason).trim() === '') {
    return res.json({ data: { allowed: false, reason: 'change_reason_required' }, error: null });
  }
  return res.json({ data: { allowed: true, reason: null }, error: null });
});

router.get('/summary', async (_req, res) => {
  const rfqs = SqliteStore.readAll('rfqs');
  const highRiskAlerts = rfqs.filter((r) => Number(r.marginPct || 0) < 10 && Number(r.total || 0) >= 100000).length;
  const lockedRecords = rfqs.filter((r) => ['approved', 'closed'].includes(String(r.status || '').toLowerCase())).length;
  const missingReasonCount = rfqs.filter((r) => ['approved', 'closed'].includes(String(r.status || '').toLowerCase()) && !r.changeReason).length;
  res.json({
    data: {
      highRiskAlerts,
      lockedRecords,
      missingReasonCount,
      internalControlScore: Math.max(0, 100 - highRiskAlerts * 5 - missingReasonCount * 3),
    },
    error: null,
  });
});

router.get('/internal-control-report', async (_req, res) => {
  const rfqs = SqliteStore.readAll('rfqs');
  const now = new Date().toISOString();
  const summary = {
    totalRfqs: rfqs.length,
    approvedOrClosed: rfqs.filter((r) => ['approved', 'closed'].includes(String(r.status || '').toLowerCase())).length,
    highRiskAlerts: rfqs.filter((r) => Number(r.marginPct || 0) < 10 && Number(r.total || 0) >= 100000).length,
  };
  res.json({
    data: {
      generatedAt: now,
      summary,
      reportId: `ctrl_${Date.now()}`,
    },
    error: null,
  });
});

export default router;
