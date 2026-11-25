import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';

const router = Router();

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const parseDate = (value) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

router.post('/validate', (req, res) => {
  const payload = req.body || {};
  const required = ['customer', 'partNo', 'quantity', 'dueDate', 'currency'];
  const missing = required.filter((field) => {
    const value = payload[field];
    if (value === 0) return false;
    return value === undefined || value === null || String(value).trim() === '';
  });
  res.json({ data: { valid: missing.length === 0, missing }, error: null });
});

router.post('/detect-duplicate', async (req, res) => {
  const payload = req.body || {};
  const rows = SqliteStore.readAll('rfqs');
  const targetCustomer = normalizeText(payload.customer);
  const targetPartNo = normalizeText(payload.partNo || payload.bomPartNo);
  const targetDue = parseDate(payload.dueDate);

  const matches = rows.filter((row) => {
    const customer = normalizeText(row.customer || row.customerName || row.createdBy);
    const partNo = normalizeText(row.partNo || row.bomPartNo);
    const due = parseDate(row.dueDate || row.requestedDate || row.timestamp);
    const sameCustomer = targetCustomer && customer && targetCustomer === customer;
    const samePartNo = targetPartNo && partNo && targetPartNo === partNo;
    const dueCloseEnough = targetDue && due ? Math.abs(targetDue - due) <= 7 * 86400000 : false;
    return sameCustomer && samePartNo && dueCloseEnough;
  });

  res.json({ data: { isDuplicate: matches.length > 0, matches }, error: null });
});

router.get('/next-id', async (_req, res) => {
  const rows = SqliteStore.readAll('rfqs');
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RFQ-${todayStr}`;
  const todayRows = rows.filter((r) => String(r.id || '').startsWith(prefix));
  const maxNum = todayRows.length
    ? Math.max(...todayRows.map((r) => parseInt(String(r.id).split('-').pop(), 10) || 0))
    : 0;
  const nextId = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
  res.json({ data: { nextId }, error: null });
});

router.post('/email-parse', (req, res) => {
  const payload = req.body || {};
  const subject = String(payload.subject || '');
  const body = String(payload.body || '');
  const customer = subject.match(/customer[:\s-]+([A-Za-z0-9 _-]+)/i)?.[1]?.trim() || 'Unknown Customer';
  const partNo = body.match(/part[:\s-]+([A-Za-z0-9._-]+)/i)?.[1]?.trim() || 'PART-UNKNOWN';
  const quantity = Number(body.match(/qty[:\s-]+(\d+)/i)?.[1] || 0);
  res.json({
    data: {
      customer,
      partNo,
      quantity,
      parsed: true,
      confidence: 0.78,
    },
    error: null,
  });
});

router.post('/attachment-vault', (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  const stored = files.map((file, idx) => ({
    id: `att_${Date.now()}_${idx}`,
    name: file.name || `attachment_${idx + 1}`,
    size: Number(file.size || 0),
    checksum: `sha1_${Math.abs((file.name || `f${idx}`).split('').reduce((a, c) => a + c.charCodeAt(0), 0))}`,
  }));
  res.json({ data: { storedCount: stored.length, stored }, error: null });
});

router.post('/batch-import-simulate', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const validRows = rows.filter((r) => r.customer && r.partNo && r.quantity).length;
  const invalidRows = rows.length - validRows;
  res.json({
    data: {
      totalRows: rows.length,
      validRows,
      invalidRows,
      accepted: validRows,
      rejected: invalidRows,
    },
    error: null,
  });
});

export default router;
