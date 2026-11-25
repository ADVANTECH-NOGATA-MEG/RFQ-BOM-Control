import { Router } from 'express';

const router = Router();

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

router.post('/preview', (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotal = items.reduce((s, it) => s + toNum(it.qty, 0) * toNum(it.unitPrice, 0), 0);
  res.json({
    data: {
      template: payload.template || 'standard',
      currency: payload.currency || 'USD',
      subtotal: Number(subtotal.toFixed(4)),
      lines: items.length,
      generatedAt: new Date().toISOString(),
    },
    error: null,
  });
});

router.post('/validity-check', (req, res) => {
  const payload = req.body || {};
  const validUntil = new Date(payload.validUntil).getTime();
  const now = Date.now();
  const valid = Number.isFinite(validUntil) && validUntil >= now;
  res.json({
    data: {
      valid,
      reason: valid ? null : 'expired_or_invalid_date',
      validUntil: payload.validUntil || null,
    },
    error: null,
  });
});

router.post('/approval-lock-check', (req, res) => {
  const payload = req.body || {};
  const approved = String(payload.status || '').toLowerCase() === 'approved';
  res.json({
    data: {
      locked: approved,
      canSend: approved,
      reason: approved ? null : 'not_approved',
    },
    error: null,
  });
});

router.post('/secure-export-watermark', (req, res) => {
  const payload = req.body || {};
  const quoteId = payload.quoteId || 'DEMO-RFQ';
  const version = payload.version || 'V1';
  const watermark = `CONFIDENTIAL-${quoteId}-${version}-${new Date().toISOString().slice(0, 10)}`;
  res.json({
    data: {
      enabled: true,
      watermark,
      policy: 'secure_export_watermark',
    },
    error: null,
  });
});

router.post('/retention-policy-check', (req, res) => {
  const payload = req.body || {};
  const createdAt = new Date(payload.createdAt).getTime();
  const keepDays = Number(payload.keepDays || 365);
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt) / 86400000)) : 0;
  const retain = ageDays <= keepDays;
  res.json({
    data: {
      retain,
      ageDays,
      keepDays,
      action: retain ? 'keep' : 'archive_or_purge',
    },
    error: null,
  });
});

router.post('/customer-view-rules', (req, res) => {
  const payload = req.body || {};
  const role = String(payload.customerTier || 'standard').toLowerCase();
  const showInternalNotes = role === 'premium';
  res.json({
    data: {
      customerTier: role,
      fields: {
        showUnitPrice: true,
        showLeadTime: true,
        showInternalNotes,
      },
      policy: showInternalNotes ? 'extended_view' : 'standard_view',
    },
    error: null,
  });
});

export default router;
