/**
 * Safe load test: 100 requests, max 5 concurrent, 100ms delay between batches.
 * Circuit breaker: stops after 3 consecutive errors.
 * Requires the server to already be running on localhost:3001.
 */

const BASE = 'http://localhost:3001';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 100;
const TOTAL_REQUESTS = 100;
const CIRCUIT_BREAKER_THRESHOLD = 3;

async function get(path) {
  const start = Date.now();
  const res = await fetch(`${BASE}${path}`);
  const ms = Date.now() - start;
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return ms;
}

async function healthCheck() {
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json();
  return body.data?.ok === true;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

// --- Pre-flight ---
console.log('Checking server health before test...');
if (!(await healthCheck())) {
  console.error('Server not reachable. Start the server first: node server/index.mjs');
  process.exit(1);
}
console.log('Server healthy. Starting load test.\n');

const timings = [];
let errors = 0;
let consecutiveErrors = 0;
const batches = Math.ceil(TOTAL_REQUESTS / BATCH_SIZE);

const endpoints = [
  '/api/rfqs',
  '/api/boms/count',
  '/api/materials?pageSize=10',
  '/api/users',
  '/api/roles',
];

for (let b = 0; b < batches; b++) {
  if (consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
    console.error(`\nCircuit breaker triggered after ${consecutiveErrors} consecutive errors. Stopping.`);
    break;
  }

  const batchRequests = Array.from({ length: BATCH_SIZE }, (_, i) => {
    const endpoint = endpoints[(b * BATCH_SIZE + i) % endpoints.length];
    return get(endpoint).then(
      (ms) => {
        consecutiveErrors = 0;
        return ms;
      },
      (err) => {
        errors++;
        consecutiveErrors++;
        console.error(`  ERROR: ${err.message}`);
        return null;
      }
    );
  });

  const results = await Promise.all(batchRequests);
  results.forEach((ms) => { if (ms !== null) timings.push(ms); });

  const completed = Math.min((b + 1) * BATCH_SIZE, TOTAL_REQUESTS);
  process.stdout.write(`\rProgress: ${completed}/${TOTAL_REQUESTS} requests`);

  if (b < batches - 1) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
}

console.log('\n');

// --- Post-flight ---
console.log('Checking server health after test...');
const postHealth = await healthCheck();
if (!postHealth) console.error('WARNING: Server did not respond to health check after test!');
else console.log('Server still healthy after test.\n');

// --- Results ---
const p50 = percentile(timings, 50);
const p95 = percentile(timings, 95);
const max = Math.max(...timings);

console.log('=== Load Test Results ===');
console.log(`Total requests:  ${TOTAL_REQUESTS}`);
console.log(`Errors:          ${errors}`);
console.log(`Successful:      ${timings.length}`);
console.log(`P50 latency:     ${p50}ms`);
console.log(`P95 latency:     ${p95}ms`);
console.log(`Max latency:     ${max}ms`);
console.log('');

const PASS = errors === 0 && p95 < 200 && postHealth;
console.log(PASS ? '✓ PASS — all targets met' : '✗ FAIL — see results above');

process.exit(PASS ? 0 : 1);
