import { Router } from 'express';
import { SqliteStore } from '../db/SqliteStore.mjs';
import { SseBroadcaster } from '../sse/SseBroadcaster.mjs';

const router = Router();
const COLLECTION = 'integration_jobs';

const buildResult = (step, payload = {}) => ({
  id: `int_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
  step,
  ok: true,
  ts: new Date().toISOString(),
  payload,
});

const toExtraCols = (r) => ({ id: r.id, status: r.status ?? null });

const handleStep = (step) => (req, res) => {
  const result = buildResult(step, req.body || {});
  SqliteStore.upsert(COLLECTION, result, toExtraCols(result));
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'upsert', data: result });
  res.json({ data: result, error: null });
};

router.post('/crm-sync', handleStep('crmSync'));
router.post('/erp-sync', handleStep('erpSync'));
router.post('/plm-pdm-sync', handleStep('plmPdmSync'));
router.post('/quote-to-so', handleStep('quoteToSo'));
router.post('/contract-linkage', handleStep('contractLinkage'));
router.post('/esign', handleStep('eSign'));
router.post('/sso-ad', handleStep('ssoAd'));
router.post('/webhook-bus', handleStep('webhookBus'));
router.post('/bi-export', handleStep('biExport'));
router.post('/mail-server-sync', handleStep('mailServerSync'));

router.post('/dry-sync', (req, res) => {
  const payload = req.body || {};
  const steps = ['crmSync','erpSync','plmPdmSync','quoteToSo','contractLinkage','eSign','ssoAd','webhookBus','biExport','mailServerSync'];
  const report = {};
  for (const step of steps) {
    const result = buildResult(step, payload);
    report[step] = result;
    SqliteStore.upsert(COLLECTION, result, toExtraCols(result));
  }
  SseBroadcaster.broadcast({ collection: COLLECTION, action: 'dry-sync' });
  res.json({ data: report, error: null });
});

export default router;
