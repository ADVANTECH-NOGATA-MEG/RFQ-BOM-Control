import { Router } from 'express';

const router = Router();

router.post('/simulate', (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotal = items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitPrice || 0)), 0);
  const fxRate = Number(payload.fxRate || 1);
  const total = Number((subtotal * fxRate).toFixed(4));
  const cost = Number((subtotal * 0.82).toFixed(4));
  const marginPct = total > 0 ? Number((((total - cost) / total) * 100).toFixed(2)) : 0;

  res.json({
    data: {
      subtotal: Number(subtotal.toFixed(4)),
      fxRate,
      total,
      marginPct,
      floorPass: marginPct >= Number(payload.marginFloorPct || 10),
    },
    error: null,
  });
});

router.post('/nre-calculate', (req, res) => {
  const payload = req.body || {};
  const tooling = Number(payload.toolingCost || 0);
  const setup = Number(payload.setupCost || 0);
  const engineering = Number(payload.engineeringCost || 0);
  const nreTotal = Number((tooling + setup + engineering).toFixed(2));
  res.json({ data: { nreTotal, breakdown: { tooling, setup, engineering } }, error: null });
});

router.post('/moq-tier', (req, res) => {
  const payload = req.body || {};
  const quantity = Number(payload.quantity || 0);
  const unitPrice = Number(payload.unitPrice || 0);
  let discountPct = 0;
  if (quantity >= 10000) discountPct = 8;
  else if (quantity >= 1000) discountPct = 4;
  const finalUnitPrice = Number((unitPrice * (1 - discountPct / 100)).toFixed(4));
  res.json({ data: { quantity, unitPrice, discountPct, finalUnitPrice }, error: null });
});

router.post('/risk-coefficient', (req, res) => {
  const payload = req.body || {};
  const leadtimeWeeks = Number(payload.leadtimeWeeks || 0);
  const volatility = Number(payload.volatility || 0);
  const coefficient = Number((1 + leadtimeWeeks * 0.01 + volatility * 0.02).toFixed(4));
  res.json({ data: { leadtimeWeeks, volatility, coefficient }, error: null });
});

router.get('/summary', (_req, res) => {
  res.json({
    data: {
      nreCoverage: 100,
      moqRuleCoverage: 100,
      riskModelCoverage: 100,
      pricingGovernanceScore: 96,
    },
    error: null,
  });
});

export default router;
