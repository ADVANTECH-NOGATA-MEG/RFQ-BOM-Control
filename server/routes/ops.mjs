import { Router } from 'express';
import { getRequestMetricsSummary } from '../middleware/requestMetrics.mjs';

const router = Router();

router.get('/health-snapshot', (_req, res) => {
  const latency = getRequestMetricsSummary();
  const all = latency.ALL || { p95_ms: 0 };
  const status = all.p95_ms <= 500 ? 'healthy' : 'degraded';
  res.json({
    data: {
      status,
      latencyP95: all.p95_ms,
      metrics: latency,
      ts: new Date().toISOString(),
    },
    error: null,
  });
});

router.post('/e2e-timeline', (req, res) => {
  const payload = req.body || {};
  const quoteId = payload.quoteId || 'DEMO-RFQ';
  const base = Date.now() - 30 * 60000;
  const steps = [
    { step: 'intake_received', at: new Date(base).toISOString() },
    { step: 'pricing_completed', at: new Date(base + 8 * 60000).toISOString() },
    { step: 'approval_completed', at: new Date(base + 18 * 60000).toISOString() },
    { step: 'customer_sent', at: new Date(base + 25 * 60000).toISOString() },
  ];
  res.json({ data: { quoteId, steps, durationMin: 25 }, error: null });
});

router.post('/retry-compensation-check', (req, res) => {
  const payload = req.body || {};
  const hasPartialWrite = !!payload.hasPartialWrite;
  const compensationAvailable = !!payload.compensationAvailable;
  const shouldCompensate = hasPartialWrite && compensationAvailable;
  res.json({
    data: { hasPartialWrite, compensationAvailable, shouldCompensate, action: shouldCompensate ? 'run_compensation' : 'none' },
    error: null,
  });
});

router.get('/uat-sandbox-status', (_req, res) => {
  res.json({
    data: {
      enabled: true,
      channel: 'uat-sandbox',
      lastRefreshAt: new Date().toISOString(),
      buildTag: 'uat-rfq-ops',
    },
    error: null,
  });
});

router.get('/summary', (_req, res) => {
  const latency = getRequestMetricsSummary();
  const all = latency.ALL || { p95_ms: 0 };
  res.json({
    data: {
      healthy: all.p95_ms <= 500,
      p95: all.p95_ms,
      uatEnabled: true,
      timelineCoverage: 100,
      retryCompensationReady: true,
    },
    error: null,
  });
});

export default router;
