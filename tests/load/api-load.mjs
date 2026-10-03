/**
 * Load test API ONEZENTRA tanpa dependency eksternal.
 *
 * Mengukur p50/p95/p99 dan error rate pada beban paralel.
 * Node >=18 punya fetch bawaan, jadi tidak perlu axios/undici.
 *
 * Jalankan:
 *   node tests/load/api-load.mjs --base=http://127.0.0.1:8000 --users=100 --duration=30
 *
 * CATATAN PENTING soal angka yang keluar dari sini:
 *  - `php artisan serve` adalah single-process PHP dev server. Ia TIDAK
 *    representative untuk produksi (php-fpm/nginx) dan throughput-nya jauh
 *    lebih rendah. Hasil dipakai sebagai pembatas bawah, bukan angka kapasitas
 *    produksi.
 *  - Karena itu error rate dianggap lebih penting daripada req/s: naiknya
 *    error rate di bawah beban lebih alarmed daripada throughput yang rendah.
 */

import { performance } from 'node:perf_hooks';
import http from 'node:http';

/**
 * Transport memakai node:http, BUKAN fetch bawaan.
 *
 * fetch (undici) di Node 26 memunculkan `setTypeOfService EINVAL` pada
 * concurrency >~150 — crash di sisi client, bukan di server. http.request
 * tidak punya jalur itu, jadi load test mengukur server, bukan bug harness.
 */
function httpGet({ host, port, path, token, timeoutMs = 15_000 }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path, method: 'GET', agent: new http.Agent({ keepAlive: true, maxSockets: 1024 }) },
      (res) => {
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, bytes }));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (e) => reject(new Error(`${e.code ?? 'ERR'}:${e.message ?? ''}`)));
    req.setHeader('Authorization', `Bearer ${token}`);
    req.setHeader('Accept', 'application/json');
    req.end();
  });
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const BASE = args.base ?? 'http://127.0.0.1:8000';
const CONCURRENCY = Number(args.users ?? 50);
const DURATION_S = Number(args.duration ?? 15);
const WARMUP_S = Number(args.warmup ?? 3);
const TOKENS = (args.tokens ?? '').split(',').filter(Boolean);

if (TOKENS.length === 0) {
  console.error('ERROR: butuh --tokens=<t1,t2,...>. Ambil dari POST /api/v1/login.');
  process.exit(2);
}

const ENDPOINTS = [
  { name: 'cluster-principal', path: '/api/v1/cluster-principal?per_page=20', weight: 4 },
  { name: 'npn', path: '/api/v1/npn?per_page=20', weight: 3 },
  { name: 'dashboard-summary', path: '/api/v1/dashboard/summary', weight: 2 },
  { name: 'receivings', path: '/api/v1/receivings?per_page=20', weight: 2 },
  { name: 'rencana-kirim', path: '/api/v1/rencana-kirim?per_page=20', weight: 2 },
];

/** Route dipilih by weight, mengikuti cara satu halaman memuat beberapa API. */
function pickEndpoint() {
  const total = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of ENDPOINTS) {
    if ((r -= e.weight) <= 0) return e;
  }
  return ENDPOINTS[0];
}

const results = [];
const errorsByEndpoint = new Map();
let totalRequests = 0;
let totalFailures = 0;

async function worker(id, deadline, warmupUntil) {
  let i = id;
  while (Date.now() < deadline) {
    const ep = pickEndpoint();
    const token = TOKENS[i++ % TOKENS.length];
    const started = performance.now();

    try {
      const u = new URL(BASE);
      const res = await httpGet({
        host: u.hostname,
        port: Number(u.port || 80),
        path: ep.path,
        token,
      });

      const ms = performance.now() - started;
      if (res.status >= 500) {
        totalFailures++;
        errorsByEndpoint.set(`${ep.name}:${res.status}`, (errorsByEndpoint.get(`${ep.name}:${res.status}`) ?? 0) + 1);
      } else if (Date.now() >= warmupUntil) {
        results.push({ ms, status: res.status, ep: ep.name });
      }
      totalRequests++;
    } catch (err) {
      totalFailures++;
      const key = `${ep.name}:${err.message ?? err.name ?? 'unknown'}`;
      errorsByEndpoint.set(key, (errorsByEndpoint.get(key) ?? 0) + 1);
      totalRequests++;
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log(`\nLOAD TEST  base=${BASE}  concurrency=${CONCURRENCY}  duration=${DURATION_S}s  warmup=${WARMUP_S}s  tokens=${TOKENS.length}\n`);

  const warmupUntil = Date.now() + WARMUP_S * 1000;
  const deadline = Date.now() + (WARMUP_S + DURATION_S) * 1000;

  const startedAll = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i, deadline, warmupUntil)),
  );
  const wall = (performance.now() - startedAll) / 1000;

  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const rps = totalRequests / wall;
  const failRate = totalRequests > 0 ? totalFailures / totalRequests : 0;

  console.log('='.repeat(72));
  console.log(`Total requests : ${totalRequests}`);
  console.log(`Wall time      : ${wall.toFixed(2)}s`);
  console.log(`Throughput     : ${rps.toFixed(1)} req/s`);
  console.log(`Failures       : ${totalFailures} (${(failRate * 100).toFixed(2)}%)`);
  console.log('-'.repeat(72));
  console.log(`p50            : ${percentile(latencies, 50).toFixed(1)} ms`);
  console.log(`p90            : ${percentile(latencies, 90).toFixed(1)} ms`);
  console.log(`p95            : ${percentile(latencies, 95).toFixed(1)} ms`);
  console.log(`p99            : ${percentile(latencies, 99).toFixed(1)} ms`);
  console.log(`max            : ${latencies.at(-1)?.toFixed(1) ?? 'n/a'} ms`);
  console.log('='.repeat(72));

  if (errorsByEndpoint.size > 0) {
    console.log('\nERROR BREAKDOWN');
    for (const [k, v] of [...errorsByEndpoint.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(38)} ${v}`);
    }
  }

  // Per-endpoint: endpoint lambat tidak terlihat dari p95 gabungan.
  console.log('\nPER-ENDPOINT');
  for (const ep of ENDPOINTS) {
    const subset = results.filter((r) => r.ep === ep.name).map((r) => r.ms).sort((a, b) => a - b);
    if (subset.length === 0) continue;
    console.log(`  ${ep.name.padEnd(20)} n=${String(subset.length).padEnd(5)} p50=${percentile(subset, 50).toFixed(1)}ms  p95=${percentile(subset, 95).toFixed(1)}ms`);
  }

  // Exit code dipakai CI: regresi latency harus menggagalkan build, bukan cuma
  // tercetak lalu hilang dari log.
  const p95 = percentile(latencies, 95);
  const p95Budget = Number(args['p95-budget'] ?? 2000);
  const failBudget = Number(args['fail-budget'] ?? 0.01);
  const p95Ok = Number.isFinite(p95) && p95 <= p95Budget;
  const failOk = failRate <= failBudget;

  console.log('\nBUDGET CHECK');
  console.log(`  p95 ${Number.isFinite(p95) ? p95.toFixed(1) : 'n/a'}ms <= ${p95Budget}ms ......... ${p95Ok ? 'PASS' : 'FAIL'}`);
  console.log(`  error rate ${(failRate * 100).toFixed(2)}% <= ${(failBudget * 100).toFixed(2)}% ......... ${failOk ? 'PASS' : 'FAIL'}`);

  process.exit(p95Ok && failOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});