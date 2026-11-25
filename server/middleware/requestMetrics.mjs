const requestStore = new Map();

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
};

const pushMetric = (key, ms) => {
  const list = requestStore.get(key) || [];
  list.push(ms);
  if (list.length > 1000) list.shift();
  requestStore.set(key, list);
};

export const requestMetricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    const routeKey = `${req.method} ${req.path}`;
    pushMetric(routeKey, ms);
    pushMetric('ALL', ms);
  });
  next();
};

export const getRequestMetricsSummary = () => {
  const summary = {};
  for (const [key, list] of requestStore.entries()) {
    summary[key] = {
      count: list.length,
      p50_ms: Number(percentile(list, 50).toFixed(2)),
      p95_ms: Number(percentile(list, 95).toFixed(2)),
      max_ms: Number((list.length ? Math.max(...list) : 0).toFixed(2)),
    };
  }
  return summary;
};
