import { Router } from 'express';

const router = Router();

const normalizeStatus = (status) => {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'submitted' || s === 'pending') return 'submitted_l1';
  return s;
};

const TRANSITIONS = {
  draft: ['submitted_l1'],
  submitted_l1: ['submitted_l2', 'rejected'],
  submitted_l2: ['submitted_l3', 'rejected'],
  submitted_l3: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};
const APPROVER_BY_LEVEL = {
  L1: 'sales_manager',
  L2: 'ops_manager',
  L3: 'finance_director',
};
const workflowAuditTrail = [];

router.post('/allowed-transitions', (req, res) => {
  const currentStatus = normalizeStatus(req.body?.currentStatus || 'draft');
  res.json({ data: { currentStatus, allowed: TRANSITIONS[currentStatus] || [] }, error: null });
});

router.post('/escalation-check', (req, res) => {
  const status = normalizeStatus(req.body?.status || 'draft');
  const ts = new Date(req.body?.timestamp).getTime();
  const now = Date.now();
  const thresholdHours = Number(req.body?.thresholdHours || 24);
  const ageHours = Number.isFinite(ts) ? Math.max(0, Math.round((now - ts) / 3600000)) : 0;
  const escalated = ageHours > thresholdHours && !['approved', 'rejected'].includes(status);
  res.json({ data: { escalated, thresholdHours, ageHours }, error: null });
});

router.post('/approval-matrix', (req, res) => {
  const amount = Math.max(0, Number(req.body?.amount || 0));
  const riskLevel = String(req.body?.riskLevel || 'medium').toLowerCase();

  const levelCount = amount >= 100000 || riskLevel === 'high' ? 3 : amount >= 30000 ? 2 : 1;
  const levels = ['L1', 'L2', 'L3'].slice(0, levelCount).map((level) => ({
    level,
    approverRole: APPROVER_BY_LEVEL[level],
    required: true,
  }));

  res.json({
    data: {
      quoteAmount: amount,
      riskLevel,
      requiredLevels: levelCount,
      levels,
    },
    error: null,
  });
});

router.post('/delegate-approval', (req, res) => {
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();
  const level = String(req.body?.level || 'L1').toUpperCase();
  const reason = String(req.body?.reason || 'capacity_balancing');
  const expiresAt = req.body?.expiresAt || new Date(Date.now() + 48 * 3600000).toISOString();
  const valid = from.length > 0 && to.length > 0 && ['L1', 'L2', 'L3'].includes(level);

  res.json({
    data: {
      delegated: valid,
      delegation: valid ? { from, to, level, reason, expiresAt } : null,
      message: valid ? 'delegation_registered' : 'invalid_delegation_request',
    },
    error: null,
  });
});

router.post('/audit-trail', (req, res) => {
  const entry = {
    id: `wf_audit_${Date.now()}`,
    quoteId: String(req.body?.quoteId || 'DEMO-RFQ'),
    action: String(req.body?.action || 'approval_checked'),
    actor: String(req.body?.actor || 'system'),
    note: String(req.body?.note || ''),
    timestamp: new Date().toISOString(),
  };
  workflowAuditTrail.unshift(entry);
  if (workflowAuditTrail.length > 200) workflowAuditTrail.length = 200;
  res.json({ data: entry, error: null });
});

router.get('/audit-trail', (req, res) => {
  const quoteId = String(req.query?.quoteId || '').trim();
  const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 10)));
  const rows = quoteId ? workflowAuditTrail.filter((row) => row.quoteId === quoteId) : workflowAuditTrail;
  res.json({ data: rows.slice(0, limit), error: null });
});

export default router;
