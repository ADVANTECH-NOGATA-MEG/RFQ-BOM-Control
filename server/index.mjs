import express from 'express';
import { PORT, HOST } from './config.mjs';
import { BackupService } from './backup/BackupService.mjs';
import { getRequestMetricsSummary, requestMetricsMiddleware } from './middleware/requestMetrics.mjs';
import bomsRouter from './routes/boms.mjs';
import rfqsRouter from './routes/rfqs.mjs';
import materialsRouter from './routes/materials.mjs';
import usersRouter from './routes/users.mjs';
import rolesRouter from './routes/roles.mjs';
import auditRouter from './routes/audit.mjs';
import rfqIntakeRouter from './routes/rfqIntake.mjs';
import pricingRouter from './routes/pricing.mjs';
import customerInteractionsRouter from './routes/customerInteractions.mjs';
import complianceRouter from './routes/compliance.mjs';
import opsRouter from './routes/ops.mjs';
import integrationRouter from './routes/integration.mjs';
import quoteRouter from './routes/quote.mjs';
import analyticsRouter from './routes/analytics.mjs';
import workflowRouter from './routes/workflow.mjs';
import { SseBroadcaster } from './sse/SseBroadcaster.mjs';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(requestMetricsMiddleware);
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('/{*path}', (_req, res) => res.sendStatus(204));

app.get('/api/health', (_req, res) => {
  res.json({
    data: {
      ok: true,
      service: 'rfq-api',
      ts: new Date().toISOString(),
      latency: getRequestMetricsSummary(),
    },
    error: null
  });
});

app.get('/api/backup/status', (_req, res) => {
  res.json({ data: BackupService.getStatus(), error: null });
});

app.post('/api/backup/trigger', async (_req, res) => {
  try {
    const result = await BackupService.triggerManual();
    res.json({ data: result, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: e.message });
  }
});

app.post('/api/backup/enabled', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ data: null, error: 'enabled must be a boolean' });
  }
  BackupService.setEnabled(enabled);
  res.json({ data: BackupService.getStatus(), error: null });
});

app.get('/api/backup/list', async (_req, res) => {
  try {
    const list = await BackupService.listBackups();
    res.json({ data: list, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: e.message });
  }
});

app.post('/api/backup/restore', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ data: null, error: 'name is required' });
  }
  try {
    // pre-restore snapshot (best-effort — doesn't fail the restore if backup is disabled)
    const preSnap = await BackupService.triggerManual().catch(() => null);
    const result = await BackupService.restoreFromBackup(name);
    res.json({
      data: { ...result, preRestoreAt: preSnap?.at || null },
      error: null
    });
  } catch (e) {
    const status = e.message === 'Invalid backup name' ? 400 : 500;
    res.status(status).json({ data: null, error: e.message });
  }
});

app.get('/api/events', (req, res) => {
  SseBroadcaster.connect(req, res);
});

app.get('/api/events/status', (_req, res) => {
  res.json({ data: { clients: SseBroadcaster.clientCount }, error: null });
});

app.use('/api/boms', bomsRouter);
app.use('/api/rfqs', rfqsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/rfq-intake', rfqIntakeRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/customer-interactions', customerInteractionsRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/ops', opsRouter);
app.use('/api/integration', integrationRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/workflow', workflowRouter);

// Legacy BOM paths (keeps existing Electron builds working)
app.use('/boms', bomsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, HOST, async () => {
  console.log(`[rfq-api] http://${HOST}:${PORT}`);
  await BackupService.runStartupBackup();
  BackupService.scheduleDailyBackup();
});
