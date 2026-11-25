import { Router } from 'express';
import path from 'node:path';
import { DATA_DIR } from '../config.mjs';
import { JsonStore } from '../data/JsonStore.mjs';

const router = Router();
const FILE = path.join(DATA_DIR, 'customer-interactions.json');
const TRACK_FILE = path.join(DATA_DIR, 'interaction-tracking.json');

router.get('/', async (_req, res) => {
  const rows = await JsonStore.readAll(FILE);
  res.json({ data: rows, error: null });
});

router.post('/', async (req, res) => {
  const event = req.body || {};
  if (!event.id) {
    event.id = `evt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }
  if (!event.createdAt) event.createdAt = new Date().toISOString();
  await JsonStore.upsert(FILE, 'id', event);
  res.json({ data: event, error: null });
});

router.post('/next-best-action', async (req, res) => {
  const { isOpened = false, hasCounterOffer = false, isOverdue = false } = req.body || {};
  let action = { code: 'NEGOTIATE', label: 'Proceed to negotiation call' };
  if (isOverdue) action = { code: 'ESCALATE', label: 'Escalate overdue RFQ' };
  else if (hasCounterOffer) action = { code: 'REVIEW_COUNTER', label: 'Review counter-offer and re-quote' };
  else if (!isOpened) action = { code: 'FOLLOW_UP', label: 'Send follow-up reminder' };
  res.json({ data: action, error: null });
});

router.post('/followup-schedule', async (req, res) => {
  const baseDate = new Date(req.body?.baseDate || new Date()).getTime();
  const offsets = Array.isArray(req.body?.offsetsDays) ? req.body.offsetsDays : [3, 7, 14];
  const rows = offsets.map((days) => ({
    days,
    dueAt: new Date(baseDate + Number(days) * 86400000).toISOString(),
    status: 'pending',
  }));
  res.json({ data: rows, error: null });
});

router.post('/counter-offer', async (req, res) => {
  const payload = req.body || {};
  const evt = {
    id: `co_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    type: 'counter_offer',
    createdAt: new Date().toISOString(),
    payload: {
      quoteId: payload.quoteId || 'DEMO-RFQ',
      version: payload.version || 'V1',
      amount: Number(payload.amount || 0),
      currency: payload.currency || 'USD',
      note: payload.note || '',
    },
  };
  await JsonStore.upsert(FILE, 'id', evt);
  res.json({ data: evt, error: null });
});

router.post('/track-open-click', async (req, res) => {
  const payload = req.body || {};
  const row = {
    id: `trk_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    quoteId: payload.quoteId || 'DEMO-RFQ',
    opened: !!payload.opened,
    clicked: !!payload.clicked,
    ts: new Date().toISOString(),
  };
  await JsonStore.upsert(TRACK_FILE, 'id', row);
  res.json({ data: row, error: null });
});

router.get('/summary', async (_req, res) => {
  const rows = await JsonStore.readAll(FILE);
  const tracks = await JsonStore.readAll(TRACK_FILE);
  const counterOffers = rows.filter((r) => r.type === 'counter_offer').length;
  const followupEvents = rows.filter((r) => String(r.type || '').includes('followup')).length;
  const opened = tracks.filter((r) => r.opened).length;
  const clicked = tracks.filter((r) => r.clicked).length;
  res.json({
    data: {
      counterOffers,
      followupEvents,
      opened,
      clicked,
      clickThroughRate: opened ? Number(((clicked / opened) * 100).toFixed(1)) : 0,
    },
    error: null,
  });
});

export default router;
