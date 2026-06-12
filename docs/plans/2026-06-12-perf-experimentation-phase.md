# Perf Experimentation Phase — Benchmark Harness Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `benchmark/` harness so it can produce empirical evidence for the findings in `benchmark/perf-scan-notes.md` (auth overhead, large pages, REST write/indexing throughput, wide schemas), then capture a baseline.

**Architecture:** The harness keeps its current shape (autocannon driven from `benchmark/src/index.ts` against the nginx dev stack). We add: a repaired `NODE_ENV=benchmark` config (isolated mongo db / data dir / ES prefix, relaxed rate+bandwidth limits, observer enabled), a discriminated-union scenario model (`http` scenarios run by autocannon; `oneshot` scenarios are timed async functions for bulk writes), per-scenario `df_req_step_seconds` + RSS deltas scraped from the prometheus observer, and auth contexts (anonymous / session cookie / API key).

**Tech Stack:** Node ≥22 (`--experimental-strip-types`), autocannon, axios (`@data-fair/lib-node/axios-auth`), prom-client exposition text parsing (regex, no new deps).

**Environment ground rules (from AGENTS.md):** never start/stop dev processes — the user runs `npm run test-deps` and `npm run dev-benchmark` in zellij. Check with `bash dev/status.sh`. Tasks 1–4 and the code of 5–9 can be done without the env; live verification steps and Task 10 need it.

**Code style:** no semicolons, single quotes, 2-space indent, `import type` for types (match existing benchmark files).

---

## Known facts the implementer must not rediscover

- `api/config/benchmark.cjs` requires `./test.cjs` which was **deleted** in commit 0e390355c — `npm run dev-benchmark` currently crashes. `development.cjs` is the surviving base; it exports `port: DEV_API_PORT` and tight limits (storage 200000 bytes, nbDatasets 20, apiRate nb 100/s, bandwidth dynamic 100000 B/s) that MUST be overridden or the benchmark measures the rate limiter.
- `indicesPrefix` is `'dataset-' + NODE_ENV` (`api/config/default.cjs:75`) so ES isolation is automatic under `NODE_ENV=benchmark`.
- `.env` ports: NGINX_PORT1=5307 (public entry), DEV_API_PORT=5317, DEV_OBSERVER_PORT=5319. `setup.ts` currently defaults to port 3867 — wrong.
- Seeded datasets get **no public permission** → today autocannon (unauthenticated) gets 401/403 and the runner only reports `errors` (connection errors), not `non2xx`. Public read = `PUT /api/v1/datasets/:id/permissions` with body `[{ classes: ['read'] }]`.
- Auth: `axiosAuth` (lib-node) returns an axios instance with a `tough-cookie` jar exposed as `ax.cookieJar`; cookies are set for the nginx origin. API key: `PUT /api/v1/settings/user/:id { apiKeys: [{ title, scopes: ['datasets'] }] }` → response `data.apiKeys[0].clearKey`; current user id from `GET <directoryUrl>/api/auth/me`.
- Observer metrics: `df_req_step_seconds` histogram with labels `routeName`, `step` (`api/src/misc/utils/observe.ts:14-19`); prom-client default metrics include `process_resident_memory_bytes`. Exposed at `http://localhost:<DEV_OBSERVER_PORT>/metrics` when `config.observer.active`.
- `development.cjs` sets `singleLineOpRefresh: true`; production default is `'wait_for'` (`api/config/default.cjs`) — benchmark must use `'wait_for'` to measure production behavior (finding T12).
- Bulk duplicate-id behavior (finding T6): each line whose `_id` is already buffered triggers an early `applyTransactions` + a 100 ms sleep. Size duplicate scenarios so worst case stays ~10–30 s, not minutes.
- `_bulk_lines` accepts NDJSON (`content-type: application/x-ndjson`), streamed, not subject to the 1000kb express.json limit.
- autocannon options used: `method`, `headers`, `body`, `idReplacement: true` (replaces `[<id>]` in the body with a unique id per request).

---

## File structure

- Modify `api/config/benchmark.cjs` — rewrite on top of `development.cjs` (Task 1)
- Modify `benchmark/src/setup.ts` — env loading, public permissions, auth helpers, wait helpers, seeding generalized (Task 2, 4)
- Modify `benchmark/src/scenarios.ts` — scenario union model + all scenarios (Tasks 3, 5–9)
- Create `benchmark/src/metrics.ts` — prometheus scrape + delta computation (Task 4)
- Modify `benchmark/src/index.ts` — runner dispatch for both scenario kinds (Task 3, 4)
- Modify `benchmark/src/reporter.ts` — result union, non2xx, step/RSS reporting (Task 3, 4)
- Modify `benchmark/src/seed.ts` — wide schema + generator (Task 8)
- Modify `api/package.json` — `dev-benchmark-prof` script (Task 9)
- Modify `benchmark/README.md` — document everything (Task 9)
- Create `benchmark/results/BASELINE.md` — baseline analysis (Task 10)

Smoke test (no env needed), used throughout — exercises all module imports and the CLI path:

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/index.ts --scenarios=__none
# Expected: "No matching scenarios. Available: <list>" and exit code 1
```

---

### Task 1: Repair `api/config/benchmark.cjs`

**Files:**
- Modify: `api/config/benchmark.cjs` (full rewrite)

- [ ] **Step 1: Rewrite the config**

```cjs
// benchmark environment: same infrastructure/ports as development (.env) but an
// isolated mongo db, data dir and ES prefix (indicesPrefix follows NODE_ENV),
// production-like single-line refresh behavior, and limits raised high enough
// that the platform, not the rate limiter, is what gets measured
const development = require('./development.cjs')

const noBandwidthLimit = { dynamic: 10000000000, static: 10000000000 }

module.exports = {
  ...development,
  dataDir: '../data/benchmark',
  tmpDir: '../data/benchmark-tmp',
  mongo: {
    ...development.mongo,
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-benchmark`,
    maxBulkOps: 1000
  },
  elasticsearch: {
    ...development.elasticsearch,
    // production default, deliberate: finding T12 measures the cost of wait_for
    singleLineOpRefresh: 'wait_for'
  },
  worker: {
    ...development.worker,
    interval: 150
  },
  observer: {
    active: true,
    port: process.env.DEV_OBSERVER_PORT
  },
  defaultLimits: {
    ...development.defaultLimits,
    totalStorage: 10000000000,
    datasetStorage: 10000000000,
    nbDatasets: 100,
    apiRate: {
      ...development.defaultLimits.apiRate,
      anonymous: { duration: 1, nb: 100000, bandwidth: noBandwidthLimit },
      user: { duration: 1, nb: 100000, bandwidth: noBandwidthLimit }
    }
  }
}
```

Note: `development.cjs` already loads dotenv and asserts `DEV_API_PORT`, so no dotenv preamble is needed. Check `development.cjs` for the exact key names under `worker` and `defaultLimits.apiRate` before committing (the spread keys must exist; if `development.defaultLimits.apiRate` has more tiers like `remoteServiceRate`/`postApplicationKey`, the spread preserves them).

- [ ] **Step 2: Verify the config loads**

```sh
cd api && NODE_ENV=benchmark node -e "const c = require('config'); console.log(c.mongo.url, c.observer, c.defaultLimits.apiRate.anonymous.nb, c.elasticsearch.singleLineOpRefresh)"
```

Expected output: `mongodb://localhost:5328/data-fair-benchmark { active: true, port: '5319' } 100000 wait_for`

- [ ] **Step 3: Lint and commit**

```sh
npx eslint api/config/benchmark.cjs
git add api/config/benchmark.cjs
git commit -m "fix(benchmark): repair benchmark config after test.cjs removal"
```

---

### Task 2: Fix setup.ts — env-derived URLs, public permissions, wait helpers

**Files:**
- Modify: `benchmark/src/setup.ts` (full rewrite below)

- [ ] **Step 1: Rewrite setup.ts**

```ts
import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import axios from 'axios'
import { benchSchema, generateRows, wideSchema, generateWideRows } from './seed.ts'
import type { AxiosInstance } from 'axios'

// derive default URLs from the repo .env (NGINX_PORT1) so the harness follows dev port assignments
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname)
} catch { /* no .env, rely on explicit BENCHMARK_* vars */ }

const nginxPort = process.env.NGINX_PORT1 || '5307'
const baseUrl = process.env.BENCHMARK_URL || `http://localhost:${nginxPort}/data-fair`
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || `http://localhost:${nginxPort}/simple-directory`

let ax: AxiosInstance
let sessionCookie: string
let apiKey: string

export async function init () {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await axiosAuth({
    email: 'dmeadus0@answers.com',
    password: 'passwd',
    directoryUrl,
    axiosOpts: { baseURL: baseUrl, headers: { 'x-cache-bypass': '1' } }
  })

  const res = await ax.get('/api/v1/datasets', { params: { size: 0 } })
  console.log(`[setup] connected (${res.data.count} existing datasets)`)

  // raw cookie header for autocannon-driven authenticated scenarios
  const jar = (ax as any).cookieJar
  sessionCookie = jar.getCookieStringSync(baseUrl + '/')
  if (!sessionCookie.includes('id_token=')) {
    sessionCookie = jar.getCookieStringSync(new URL(baseUrl).origin + '/')
  }
  if (!sessionCookie.includes('id_token=')) throw new Error('[setup] could not extract session cookies from jar')

  // a datasets-scoped api key (benchmark db is isolated, overwriting user settings is fine)
  const me = (await ax.get(`${directoryUrl}/api/auth/me`)).data
  const settingsRes = await ax.put(`/api/v1/settings/user/${me.id}`, {
    apiKeys: [{ title: 'benchmark', scopes: ['datasets'] }]
  })
  apiKey = settingsRes.data.apiKeys[0].clearKey
}

export interface SeedSpec {
  id: string
  count: number
  schema: any[]
  generate: (count: number) => any[]
}

export const seedSpecs: SeedSpec[] = [
  { id: 'bench-small', count: 1000, schema: benchSchema, generate: c => generateRows(c) },
  { id: 'bench-large', count: 100000, schema: benchSchema, generate: c => generateRows(c) },
  { id: 'bench-wide', count: 5000, schema: wideSchema, generate: c => generateWideRows(c) }
]

export async function seedDatasets () {
  for (const spec of seedSpecs) {
    let exists = false
    try {
      const res = await ax.get(`/api/v1/datasets/${spec.id}`)
      if (res.data.status === 'finalized' && res.data.count >= spec.count) exists = true
    } catch { /* dataset doesn't exist */ }

    if (!exists) {
      console.log(`[seed] creating ${spec.id} (${spec.count} rows)...`)
      await ax.put(`/api/v1/datasets/${spec.id}`, { isRest: true, title: spec.id, schema: spec.schema })
      await seedRows(spec.id, spec.generate(spec.count))
      await waitForDataset(spec.id, d => d.status === 'finalized' && d.count >= spec.count, 180)
    } else {
      console.log(`[seed] ${spec.id} already exists, skipping`)
    }

    // idempotent: anonymous read access, so unauthenticated autocannon runs measure 200s not 403s
    await ax.put(`/api/v1/datasets/${spec.id}/permissions`, [{ classes: ['read'] }])
    console.log(`[seed] ${spec.id} ready`)
  }
}

export async function seedRows (datasetId: string, rows: any[], batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    await ax.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, rows.slice(i, i + batchSize))
    if ((i + batchSize) % 10000 === 0 || i + batchSize >= rows.length) {
      console.log(`[seed] ${datasetId}: ${Math.min(i + batchSize, rows.length)}/${rows.length} rows`)
    }
  }
}

export async function waitForDataset (datasetId: string, predicate: (dataset: any) => boolean, timeoutSec = 120) {
  for (let attempt = 0; attempt < timeoutSec * 2; attempt++) {
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    if (predicate(res.data)) return res.data
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${datasetId} did not reach expected state within ${timeoutSec}s`)
}

export async function waitForLinesTotal (datasetId: string, expected: number, timeoutSec = 600, params = '') {
  for (let attempt = 0; attempt < timeoutSec * 2; attempt++) {
    const res = await ax.get(`/api/v1/datasets/${datasetId}/lines?size=0${params}`)
    if (res.data.total === expected) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${datasetId} lines total did not reach ${expected} within ${timeoutSec}s`)
}

export async function recreateDataset (id: string, schema: any[] = benchSchema) {
  try {
    await ax.delete(`/api/v1/datasets/${id}`)
  } catch (err: any) {
    if (err.status !== 404) throw err
  }
  await ax.put(`/api/v1/datasets/${id}`, { isRest: true, title: id, schema })
  await waitForDataset(id, d => d.status === 'finalized', 60)
}

export function getBaseUrl () { return baseUrl }
export function getAxios () { return ax }
export function getAnonAxios () { return axios.create({ baseURL: baseUrl, validateStatus: () => true }) }
export function getSessionCookie () { return sessionCookie }
export function getApiKey () { return apiKey }
```

Note: `wideSchema`/`generateWideRows` don't exist yet — Task 8 adds them. To keep this task self-contained and the smoke test green, add them to `seed.ts` NOW as part of this task (code in Task 8 Step 1 — copy it from there verbatim into this task's commit).

- [ ] **Step 2: Smoke test**

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/index.ts --scenarios=__none
```

Expected: `No matching scenarios. Available: simple-list, ...` exit 1 (index.ts is still the old runner at this point; it imports setup.ts, which must parse).

- [ ] **Step 3: Lint and commit**

```sh
npx eslint benchmark/src/setup.ts benchmark/src/seed.ts
git add benchmark/src/setup.ts benchmark/src/seed.ts
git commit -m "fix(benchmark): env-derived urls, public read permissions, auth helpers, wait/recreate helpers"
```

---

### Task 3: Scenario model union + runner dispatch + reporter union

**Files:**
- Modify: `benchmark/src/scenarios.ts` (full rewrite)
- Modify: `benchmark/src/index.ts` (full rewrite)
- Modify: `benchmark/src/reporter.ts` (full rewrite)

- [ ] **Step 1: Rewrite scenarios.ts with the union model (existing 9 scenarios preserved as `http`)**

```ts
import { getBaseUrl, getAxios, getAnonAxios, getSessionCookie, getApiKey } from './setup.ts'
import type { AxiosInstance } from 'axios'

export interface BenchContext {
  baseUrl: string
  ax: AxiosInstance
  anonAxios: AxiosInstance
  sessionCookie: string
  apiKey: string
}

export function buildContext (): BenchContext {
  return {
    baseUrl: getBaseUrl(),
    ax: getAxios(),
    anonAxios: getAnonAxios(),
    sessionCookie: getSessionCookie(),
    apiKey: getApiKey()
  }
}

export interface HttpRequestSpec {
  path: string
  method?: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  body?: string
  idReplacement?: boolean
}

export interface HttpScenario {
  kind: 'http'
  name: string
  description: string
  request: (ctx: BenchContext) => HttpRequestSpec
  prepare?: (ctx: BenchContext) => Promise<void>
  expectStatus?: number
}

export interface OneShotScenario {
  kind: 'oneshot'
  name: string
  description: string
  repetitions?: number
  prepare?: (ctx: BenchContext) => Promise<void>
  run: (ctx: BenchContext) => Promise<Record<string, number>>
}

export type Scenario = HttpScenario | OneShotScenario

const lines = (datasetId: string, queryParams: string): ((ctx: BenchContext) => HttpRequestSpec) =>
  () => ({ path: `/api/v1/datasets/${datasetId}/lines?${queryParams}` })

export const scenarios: Scenario[] = [
  { kind: 'http', name: 'simple-list', description: 'Baseline paginated list', request: lines('bench-large', 'size=20') },
  { kind: 'http', name: 'fulltext-search', description: 'Full-text search', request: lines('bench-large', 'q=analyse+population&size=20') },
  { kind: 'http', name: 'filter-eq', description: 'Exact match filter', request: lines('bench-large', 'str2_eq=cat-alpha&size=20') },
  { kind: 'http', name: 'filter-range', description: 'Range filter', request: lines('bench-large', 'num1_gte=200&num1_lte=800&size=20') },
  { kind: 'http', name: 'sort', description: 'Sort by integer field', request: lines('bench-large', 'sort=num1&size=20') },
  { kind: 'http', name: 'deep-pagination', description: 'Deep offset pagination', request: lines('bench-large', 'page=500&size=20&sort=_i') },
  { kind: 'http', name: 'geo-bbox', description: 'Geo bounding box filter', request: lines('bench-large', 'bbox=-5,42,8,51&size=20') },
  { kind: 'http', name: 'combined', description: 'Search + filter + sort combined', request: lines('bench-large', 'q=analyse&num1_gte=100&sort=num1&size=20') },
  { kind: 'http', name: 'small-dataset', description: 'Small dataset baseline', request: lines('bench-small', 'size=20') }
]
```

(Tasks 5–8 append more scenarios to this array; the `lines` helper and `buildContext` stay.)

- [ ] **Step 2: Rewrite index.ts (runner dispatch; metrics hooks added in Task 4 — leave the marked TODO-free seams exactly as written)**

```ts
import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { init, seedDatasets } from './setup.ts'
import { scenarios, buildContext, type HttpScenario, type OneShotScenario } from './scenarios.ts'
import { printResults, saveResults, type ScenarioResult, type HttpScenarioResult, type OneShotScenarioResult } from './reporter.ts'

const { values: args } = parseArgs({
  options: {
    scenarios: { type: 'string', default: 'reads' },
    duration: { type: 'string', default: '10' },
    connections: { type: 'string', default: '10' },
    warmup: { type: 'string', default: '3' },
    repetitions: { type: 'string' },
    'no-save': { type: 'boolean', default: false }
  }
})

// groups: 'reads' = all http GET scenarios, 'writes' = all oneshot + http write scenarios, 'all' = everything
const isWrite = (s: typeof scenarios[0]) => s.kind === 'oneshot' || s.name.includes('write')
const selectedNames = args.scenarios === 'all'
  ? scenarios.map(s => s.name)
  : args.scenarios === 'reads'
    ? scenarios.filter(s => !isWrite(s)).map(s => s.name)
    : args.scenarios === 'writes'
      ? scenarios.filter(isWrite).map(s => s.name)
      : args.scenarios!.split(',')

const selectedScenarios = scenarios.filter(s => selectedNames.includes(s.name))
if (selectedScenarios.length === 0) {
  console.error(`No matching scenarios. Available: ${scenarios.map(s => s.name).join(', ')} (or groups: reads, writes, all)`)
  process.exit(1)
}

const duration = parseInt(args.duration!)
const connections = parseInt(args.connections!)
const warmupDuration = parseInt(args.warmup!)

async function runHttpScenario (scenario: HttpScenario, ctx: ReturnType<typeof buildContext>): Promise<HttpScenarioResult> {
  if (scenario.prepare) await scenario.prepare(ctx)
  const spec = scenario.request(ctx)
  const url = ctx.baseUrl + spec.path

  // probe with the exact same request shape autocannon will send
  const probe = await ctx.anonAxios.request({
    url: spec.path,
    method: spec.method ?? 'GET',
    headers: spec.headers,
    data: spec.body
  })
  const expected = scenario.expectStatus ?? 200
  if (probe.status !== expected) {
    throw new Error(`Pre-check failed for ${scenario.name}: status ${probe.status} (expected ${expected})`)
  }

  const opts = {
    url,
    connections,
    method: (spec.method ?? 'GET') as 'GET' | 'POST' | 'PUT',
    headers: spec.headers,
    body: spec.body,
    idReplacement: spec.idReplacement
  }

  if (warmupDuration > 0) {
    console.log(`  warmup (${warmupDuration}s)...`)
    await autocannon({ ...opts, duration: warmupDuration })
  }

  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const result = await autocannon({ ...opts, duration })

  return {
    kind: 'http',
    name: scenario.name,
    description: scenario.description,
    latency: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99, avg: result.latency.average },
    throughput: { avg: result.requests.average, total: result.requests.total },
    errors: result.errors,
    non2xx: result.non2xx,
    duration
  }
}

async function runOneShotScenario (scenario: OneShotScenario, ctx: ReturnType<typeof buildContext>): Promise<OneShotScenarioResult> {
  const repetitions = args.repetitions ? parseInt(args.repetitions) : (scenario.repetitions ?? 1)
  const metrics: Record<string, number[]> = {}
  for (let rep = 0; rep < repetitions; rep++) {
    if (scenario.prepare) {
      console.log(`  rep ${rep + 1}/${repetitions}: preparing...`)
      await scenario.prepare(ctx)
    }
    console.log(`  rep ${rep + 1}/${repetitions}: running...`)
    const m = await scenario.run(ctx)
    for (const [key, value] of Object.entries(m)) {
      (metrics[key] = metrics[key] || []).push(value)
    }
  }
  return { kind: 'oneshot', name: scenario.name, description: scenario.description, repetitions, metrics }
}

async function main () {
  console.log('Starting benchmark...')
  console.log(`Scenarios: ${selectedScenarios.map(s => s.name).join(', ')}`)
  console.log(`Duration: ${duration}s, Connections: ${connections}, Warmup: ${warmupDuration}s`)
  console.log('')

  await init()
  await seedDatasets()
  const ctx = buildContext()

  const results: ScenarioResult[] = []
  for (const scenario of selectedScenarios) {
    console.log(`\n[${scenario.name}] ${scenario.description}`)
    try {
      const result = scenario.kind === 'http'
        ? await runHttpScenario(scenario, ctx)
        : await runOneShotScenario(scenario, ctx)
      results.push(result)
    } catch (err) {
      console.error(`  FAILED: ${err}`)
    }
  }

  printResults(results)
  if (!args['no-save']) saveResults(results)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
```

Note the CLI default changed from `all` to `reads` (oneshot write scenarios are long; `all` now means everything). The probe uses `anonAxios` with `validateStatus: () => true` (set in setup), so non-200 doesn't throw — it's compared explicitly.

- [ ] **Step 3: Rewrite reporter.ts**

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { StepDelta } from './metrics.ts'

interface BaseResult {
  name: string
  description: string
  steps?: StepDelta[]
  rssDeltaMb?: number
}

export interface HttpScenarioResult extends BaseResult {
  kind: 'http'
  latency: { p50: number, p97_5: number, p99: number, avg: number }
  throughput: { avg: number, total: number }
  errors: number
  non2xx: number
  duration: number
}

export interface OneShotScenarioResult extends BaseResult {
  kind: 'oneshot'
  repetitions: number
  metrics: Record<string, number[]>
}

export type ScenarioResult = HttpScenarioResult | OneShotScenarioResult

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function printResults (results: ScenarioResult[]) {
  const httpResults = results.filter((r): r is HttpScenarioResult => r.kind === 'http')
  const oneShotResults = results.filter((r): r is OneShotScenarioResult => r.kind === 'oneshot')

  if (httpResults.length) {
    const nameWidth = Math.max(20, ...httpResults.map(r => r.name.length + 2))
    console.log('')
    console.log(`Benchmark Results - ${new Date().toISOString().split('T')[0]}`)
    console.log('='.repeat(nameWidth + 62))
    console.log('Scenario'.padEnd(nameWidth) + '| p50 (ms) | p97.5(ms)| p99 (ms) | req/s  | non2xx | errors')
    console.log('-'.repeat(nameWidth + 62))
    for (const r of httpResults) {
      console.log(
        r.name.padEnd(nameWidth) +
        `| ${fmtMs(r.latency.p50)} | ${fmtMs(r.latency.p97_5)} | ${fmtMs(r.latency.p99)} | ${fmtReqs(r.throughput.avg)} | ${String(r.non2xx).padStart(6)} | ${r.errors}`
      )
    }
    console.log('='.repeat(nameWidth + 62))
  }

  for (const r of oneShotResults) {
    console.log(`\n[${r.name}] (${r.repetitions} repetition${r.repetitions > 1 ? 's' : ''}, median shown)`)
    for (const [key, values] of Object.entries(r.metrics)) {
      const extra = values.length > 1 ? `  (min ${fmtNum(Math.min(...values))}, max ${fmtNum(Math.max(...values))})` : ''
      console.log(`  ${key}: ${fmtNum(median(values))}${extra}`)
    }
  }

  for (const r of results) {
    if (r.steps?.length || r.rssDeltaMb !== undefined) {
      console.log(`\n[${r.name}] server-side detail:`)
      if (r.rssDeltaMb !== undefined) console.log(`  rss delta: ${r.rssDeltaMb.toFixed(1)} MB`)
      for (const s of r.steps ?? []) {
        console.log(`  ${s.routeName} ${s.step}: n=${s.count} avg=${s.avgMs.toFixed(2)}ms total=${(s.totalMs / 1000).toFixed(2)}s`)
      }
    }
  }
  console.log('')
}

const fmtMs = (v: number) => String(v.toFixed(1)).padStart(8)
const fmtReqs = (v: number) => String(Math.round(v)).padStart(6)
const fmtNum = (v: number) => v >= 100 ? String(Math.round(v)) : v.toFixed(1)

export function saveResults (results: ScenarioResult[]) {
  let gitCommit = 'unknown'
  let gitBranch = 'unknown'
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch { /* ignore */ }

  const output = {
    timestamp: new Date().toISOString(),
    git: { commit: gitCommit, branch: gitBranch },
    node: process.version,
    results
  }

  const dir = path.resolve(import.meta.dirname, '../results')
  mkdirSync(dir, { recursive: true })
  const filepath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(filepath, JSON.stringify(output, null, 2))
  console.log(`Results saved to ${filepath}`)
}
```

`StepDelta`/`metrics.ts` doesn't exist until Task 4. To keep this commit green, create `benchmark/src/metrics.ts` in THIS task containing only the type (Task 4 fills in the functions):

```ts
export interface StepDelta {
  routeName: string
  step: string
  count: number
  totalMs: number
  avgMs: number
}
```

- [ ] **Step 4: Smoke test**

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/index.ts --scenarios=__none
```

Expected: `No matching scenarios. Available: simple-list, ... (or groups: reads, writes, all)` exit 1.

- [ ] **Step 5: Lint and commit**

```sh
npx eslint benchmark/src
git add benchmark/src
git commit -m "refactor(benchmark): scenario union model (http autocannon + oneshot timed runs)"
```

---

### Task 4: Observer metrics sampling (df_req_step_seconds + RSS deltas)

**Files:**
- Modify: `benchmark/src/metrics.ts` (add functions next to the Task 3 type)
- Modify: `benchmark/src/index.ts` (wrap scenario runs with sampling)

- [ ] **Step 1: Complete metrics.ts**

```ts
export interface StepDelta {
  routeName: string
  step: string
  count: number
  totalMs: number
  avgMs: number
}

export interface MetricsSnapshot {
  steps: Map<string, { count: number, sum: number }>
  rssBytes: number | null
}

const observerPort = process.env.DEV_OBSERVER_PORT || '5319'
const metricsUrl = process.env.BENCHMARK_METRICS_URL || `http://localhost:${observerPort}/metrics`

let warned = false

/** Scrape the prometheus observer; returns null (once warning) when the observer is unreachable */
export async function sampleMetrics (): Promise<MetricsSnapshot | null> {
  let text: string
  try {
    const res = await fetch(metricsUrl, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) throw new Error(`status ${res.status}`)
    text = await res.text()
  } catch (err) {
    if (!warned) {
      console.log(`  (observer not reachable at ${metricsUrl}, skipping server-side metrics: ${err})`)
      warned = true
    }
    return null
  }

  const steps = new Map<string, { count: number, sum: number }>()
  let rssBytes: number | null = null
  for (const line of text.split('\n')) {
    let m = /^df_req_step_seconds_(sum|count)\{(.*)\} (\S+)$/.exec(line)
    if (m) {
      const entry = steps.get(m[2]) ?? { count: 0, sum: 0 }
      if (m[1] === 'sum') entry.sum = Number(m[3])
      else entry.count = Number(m[3])
      steps.set(m[2], entry)
      continue
    }
    m = /^process_resident_memory_bytes (\S+)$/.exec(line)
    if (m) rssBytes = Number(m[1])
  }
  return { steps, rssBytes }
}

const parseLabels = (labels: string) => {
  const routeName = /routeName="([^"]*)"/.exec(labels)?.[1] ?? labels
  const step = /step="([^"]*)"/.exec(labels)?.[1] ?? ''
  return { routeName, step }
}

export function diffSteps (before: MetricsSnapshot | null, after: MetricsSnapshot | null, top = 10): StepDelta[] | undefined {
  if (!before || !after) return undefined
  const deltas: StepDelta[] = []
  for (const [labels, a] of after.steps) {
    const b = before.steps.get(labels) ?? { count: 0, sum: 0 }
    const count = a.count - b.count
    if (count <= 0) continue
    const totalMs = (a.sum - b.sum) * 1000
    const { routeName, step } = parseLabels(labels)
    deltas.push({ routeName, step, count, totalMs, avgMs: totalMs / count })
  }
  return deltas.sort((d1, d2) => d2.totalMs - d1.totalMs).slice(0, top)
}

export function rssDeltaMb (before: MetricsSnapshot | null, after: MetricsSnapshot | null): number | undefined {
  if (before?.rssBytes == null || after?.rssBytes == null) return undefined
  return (after.rssBytes - before.rssBytes) / 1024 / 1024
}
```

- [ ] **Step 2: Wire sampling into index.ts**

In `runHttpScenario`, replace the benchmark block:

```ts
  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const before = await sampleMetrics()
  const result = await autocannon({ ...opts, duration })
  const after = await sampleMetrics()
```

and add to the returned object:

```ts
    steps: diffSteps(before, after),
    rssDeltaMb: rssDeltaMb(before, after),
```

In `runOneShotScenario`, sample around `scenario.run` of the LAST repetition only (steps of a single representative run):

```ts
    const isLast = rep === repetitions - 1
    const before = isLast ? await sampleMetrics() : null
    const m = await scenario.run(ctx)
    const after = isLast ? await sampleMetrics() : null
    if (isLast) {
      lastSteps = diffSteps(before, after)
      lastRss = rssDeltaMb(before, after)
    }
```

declaring `let lastSteps, lastRss` before the loop and adding `steps: lastSteps, rssDeltaMb: lastRss` to the returned object. Add the import at the top of index.ts:

```ts
import { sampleMetrics, diffSteps, rssDeltaMb } from './metrics.ts'
```

- [ ] **Step 3: Smoke test + lint + commit**

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/index.ts --scenarios=__none
npx eslint benchmark/src
git add benchmark/src
git commit -m "feat(benchmark): per-scenario df_req_step_seconds and RSS deltas from the observer"
```

---

### Task 5: Auth-overhead scenarios (findings T2/T8)

**Files:**
- Modify: `benchmark/src/scenarios.ts` (append to the `scenarios` array)

- [ ] **Step 1: Append scenarios**

```ts
  // --- auth overhead: identical query, different auth contexts (scan findings T2, T8) ---
  {
    kind: 'http',
    name: 'auth-anonymous',
    description: 'simple-list, no auth (baseline for auth-* comparison)',
    request: lines('bench-large', 'size=20')
  },
  {
    kind: 'http',
    name: 'auth-session',
    description: 'simple-list with session cookie (JWT verify per request, T2)',
    request: ctx => ({ path: '/api/v1/datasets/bench-large/lines?size=20', headers: { cookie: ctx.sessionCookie } })
  },
  {
    kind: 'http',
    name: 'auth-apikey',
    description: 'simple-list with x-apiKey (uncached settings findOne per request, T8)',
    request: ctx => ({ path: '/api/v1/datasets/bench-large/lines?size=20', headers: { 'x-apikey': ctx.apiKey } })
  },
```

(The embed-referer + application-key variant for T7 needs a configured application — out of scope for now, listed as future work in the README.)

- [ ] **Step 2: Live verification (requires running env)**

Check `bash dev/status.sh`. If services are down, ask the user to run `npm run test-deps` and `npm run dev-benchmark` in zellij panes, then:

```sh
npm run benchmark -- --scenarios=auth-anonymous,auth-session,auth-apikey --duration=10
```

Expected: three rows, `non2xx` column = 0 for all three. The p50/req-s gap between `auth-anonymous` and `auth-session` is the empirical measure of T2.

- [ ] **Step 3: Lint and commit**

```sh
npx eslint benchmark/src/scenarios.ts
git add benchmark/src/scenarios.ts
git commit -m "feat(benchmark): auth-overhead scenarios (anonymous vs session vs api key)"
```

---

### Task 6: Large-page scenarios (findings T1/T5/T13/T14/T17)

**Files:**
- Modify: `benchmark/src/scenarios.ts` (append)

- [ ] **Step 1: Append scenarios**

```ts
  // --- large pages: result preparation + serialization + etag dominate (T1, T5, T13, T14, T17) ---
  {
    kind: 'http',
    name: 'large-page-json',
    description: '10000-row JSON page',
    request: lines('bench-large', 'size=10000')
  },
  {
    kind: 'http',
    name: 'large-page-csv',
    description: '10000-row CSV page',
    request: lines('bench-large', 'size=10000&format=csv')
  },
  {
    kind: 'http',
    name: 'wide-list',
    description: '100 rows of a 300-column dataset (schema-scan sensitivity, T1/T16)',
    request: lines('bench-wide', 'size=100')
  },
```

- [ ] **Step 2: Live verification (requires running env)**

```sh
npm run benchmark -- --scenarios=large-page-json,large-page-csv,wide-list --duration=10 --connections=4
```

Expected: `non2xx` = 0; the per-step report shows `prepareResultItems` and `finish` step timings — keep these numbers, they are the direct baseline for findings T1/T13.

- [ ] **Step 3: Lint and commit**

```sh
npx eslint benchmark/src/scenarios.ts
git add benchmark/src/scenarios.ts
git commit -m "feat(benchmark): large-page and wide-schema read scenarios"
```

---

### Task 7: Bulk-write one-shot scenarios (findings T4/T6/T9/T10/T11)

**Files:**
- Modify: `benchmark/src/scenarios.ts` (imports + append)

- [ ] **Step 1: Add imports at the top of scenarios.ts**

```ts
import { generateRows, generateWideRows, wideSchema } from './seed.ts'
import { recreateDataset, seedRows, waitForLinesTotal } from './setup.ts'
```

- [ ] **Step 2: Append a module-level helper and the scenarios**

```ts
const toNdjson = (rows: any[]) => rows.map(r => JSON.stringify(r)).join('\n')

const postBulk = async (ctx: BenchContext, datasetId: string, body: string) => {
  const t0 = performance.now()
  await ctx.ax.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, body, {
    headers: { 'content-type': 'application/x-ndjson' },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  })
  return performance.now() - t0
}
```

```ts
  // --- bulk write path (T4 mark-indexed findOne/line, T9 bulk size, T10 O(n²)+$or, T11 per-line costs) ---
  {
    kind: 'oneshot',
    name: 'bulk-ndjson-unique',
    description: '100k unique-id createOrUpdate NDJSON: request time (mongo phase) + indexing time (worker phase)',
    prepare: async () => { await recreateDataset('bench-write') },
    run: async (ctx) => {
      const count = 100000
      const requestMs = await postBulk(ctx, 'bench-write', toNdjson(generateRows(count)))
      const t1 = performance.now()
      await waitForLinesTotal('bench-write', count, 600)
      const indexMs = performance.now() - t1
      return { requestMs, indexMs, linesPerSec: count / ((requestMs + indexMs) / 1000) }
    }
  },
  {
    kind: 'oneshot',
    name: 'bulk-ndjson-duplicates',
    description: '10k lines cycling 100 ids: duplicate-in-batch flush + 100ms sleep penalty (T6)',
    prepare: async () => { await recreateDataset('bench-write') },
    run: async (ctx) => {
      const rows = generateRows(10000).map((r, i) => ({ ...r, _id: `dup-${i % 100}` }))
      const requestMs = await postBulk(ctx, 'bench-write', toNdjson(rows))
      await waitForLinesTotal('bench-write', 100, 120)
      return { requestMs, linesPerSec: 10000 / (requestMs / 1000) }
    }
  },
  {
    kind: 'oneshot',
    name: 'bulk-patch',
    description: '50k patches on existing lines: read-back pass with O(n²) scans and $or filters (T10)',
    prepare: async () => {
      await recreateDataset('bench-write')
      await seedRows('bench-write', generateRows(50000))
      await waitForLinesTotal('bench-write', 50000, 600)
    },
    run: async (ctx) => {
      const patches = Array.from({ length: 50000 }, (_, i) => ({ _id: `row-${i}`, _action: 'patch', str2: 'patched' }))
      const requestMs = await postBulk(ctx, 'bench-write', toNdjson(patches))
      const t1 = performance.now()
      await waitForLinesTotal('bench-write', 50000, 600, '&str2_eq=patched')
      const indexMs = performance.now() - t1
      return { requestMs, indexMs, linesPerSec: 50000 / ((requestMs + indexMs) / 1000) }
    }
  },
```

Sizing rationale (do not change without re-deriving): duplicates cycle 100 ids over 10k lines → first 100 lines fill the buffer, then each duplicate hit triggers flush+100 ms sleep ≈ ~99 sleeps ≈ ~10 s floor — measurable, not pathological. The 100k NDJSON body is ~17 MB; if nginx replies 413, halve to 50k and note it in the README (don't raise nginx limits).

- [ ] **Step 3: Live verification (requires running env)**

```sh
npm run benchmark -- --scenarios=bulk-ndjson-duplicates --duration=1
npm run benchmark -- --scenarios=bulk-ndjson-unique
```

Expected: duplicates `requestMs` ≳ 10000 (the T6 sleeps); unique completes with `requestMs` + `indexMs` reported and total 100000 reached.

- [ ] **Step 4: Lint and commit**

```sh
npx eslint benchmark/src/scenarios.ts
git add benchmark/src/scenarios.ts
git commit -m "feat(benchmark): bulk write one-shot scenarios (unique, duplicates, patch)"
```

---

### Task 8: Wide schema seed + single-line write scenarios (findings T3/T12/T22)

**Files:**
- Modify: `benchmark/src/seed.ts` (append — NOTE: if Task 2 already added this code to keep imports green, skip Step 1)
- Modify: `benchmark/src/scenarios.ts` (append)

- [ ] **Step 1: Append to seed.ts**

```ts
// 300-column schema: amplifies any per-request/per-line O(schema) cost
// (ajv compile T3, schema scans T1/T9/T16)
export const wideSchema = Array.from({ length: 300 }, (_, i) => (
  i % 3 === 2
    ? { key: `col${i}`, type: 'number' }
    : { key: `col${i}`, type: 'string' }
))

export function generateWideRows (count: number, seed = 7) {
  const rand = mulberry32(seed)
  const rows = []
  for (let i = 0; i < count; i++) {
    const row: Record<string, any> = { _id: `wrow-${i}` }
    for (let c = 0; c < wideSchema.length; c++) {
      row[`col${c}`] = c % 3 === 2 ? Math.floor(rand() * 100000) : `val-${Math.floor(rand() * 1000)}`
    }
    rows.push(row)
  }
  return rows
}
```

(`mulberry32` is already defined at the top of seed.ts.)

- [ ] **Step 2: Append the single-line write scenarios to scenarios.ts**

```ts
  // --- single-line writes: ajv compile per request (T3), sync index + refresh wait_for (T12), events-log (T22) ---
  {
    kind: 'http',
    name: 'single-line-writes',
    description: 'concurrent POST /lines, unique ids (T3 compile/leak + T12 wait_for); watch rssDelta across runs',
    prepare: async () => { await recreateDataset('bench-single') },
    request: ctx => ({
      path: '/api/v1/datasets/bench-single/lines',
      method: 'POST',
      headers: { cookie: ctx.sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ _id: '[<id>]', str1: 'analyse population', str2: 'cat-alpha', num1: 42, num2: 3.14, date1: '2024-01-15', lat: 45.1, lon: 1.5 }),
      idReplacement: true
    }),
    expectStatus: 201
  },
  {
    kind: 'http',
    name: 'wide-single-line-writes',
    description: 'concurrent POST /lines on the 300-column dataset (ajv compile cost scales with schema, T3)',
    prepare: async (ctx) => {
      await recreateDataset('bench-single-wide', wideSchema)
    },
    request: ctx => {
      const body: Record<string, any> = { _id: '[<id>]' }
      for (let c = 0; c < 300; c++) body[`col${c}`] = c % 3 === 2 ? 7 : 'v'
      return {
        path: '/api/v1/datasets/bench-single-wide/lines',
        method: 'POST',
        headers: { cookie: ctx.sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        idReplacement: true
      }
    },
    expectStatus: 201
  },
```

Check the actual created-line status code during live verification: data-fair may answer 200 or 201 on `POST /lines` — set `expectStatus` to what a manual probe returns.

- [ ] **Step 3: Live verification (requires running env)**

```sh
npm run benchmark -- --scenarios=single-line-writes --duration=15 --connections=10
npm run benchmark -- --scenarios=wide-single-line-writes --duration=15 --connections=10
```

Expected: `non2xx` = 0. Three things to read off the result: req/s ceiling (T12 `wait_for` coalescing), the wide-vs-narrow req/s ratio (T3 compile scales with schema width), and `rss delta` strictly positive and growing run-over-run (T3 leak evidence — compare a 15 s run and a 60 s run).

- [ ] **Step 4: Lint and commit**

```sh
npx eslint benchmark/src
git add benchmark/src
git commit -m "feat(benchmark): single-line write scenarios incl. 300-column variant"
```

---

### Task 9: Profiling script + README

**Files:**
- Modify: `api/package.json` (one script)
- Modify: `benchmark/README.md`

- [ ] **Step 1: Add the profiling variant of dev-benchmark next to the existing script in api/package.json**

```json
    "dev-benchmark-prof": "NODE_ENV=benchmark node --cpu-prof --cpu-prof-dir=../dev/profiles --experimental-strip-types --disable-warning=ExperimentalWarning index.ts",
```

(No `--watch`: the .cpuprofile is written on clean process exit; the user stops it with Ctrl-C in its zellij pane. Profiles load in Chrome DevTools > Performance > Load profile.)

Also add the root-level alias in `package.json` next to `dev-benchmark`:

```json
    "dev-benchmark-prof": "MODE=server_worker npm -w api run dev-benchmark-prof",
```

- [ ] **Step 2: Rewrite benchmark/README.md**

Document (concise, same tone as current README): the three-terminal workflow (test-deps / dev-benchmark / benchmark), the scenario groups (`reads` default, `writes`, `all`, comma-list), every scenario with one line on what finding it measures (reference `benchmark/perf-scan-notes.md` ids), the `--repetitions`, `--duration`, `--connections`, `--no-save` flags, the server-side step metrics + RSS delta (requires the observer, enabled by the benchmark config), the profiling workflow with `dev-benchmark-prof`, and the future-work note (embed-referer/application-key scenario for T7 needs a configured application). Mention that the benchmark env is isolated (mongo db `data-fair-benchmark`, ES prefix `dataset-benchmark`, dataDir `data/benchmark`).

- [ ] **Step 3: Commit**

```sh
git add api/package.json package.json benchmark/README.md
git commit -m "feat(benchmark): cpu-profiling launch script and README for the extended harness"
```

---

### Task 10: Baseline capture (requires running env + user)

**Files:**
- Create: `benchmark/results/BASELINE.md`

- [ ] **Step 1: Pre-flight.** `bash dev/status.sh`; ask the user to start `npm run test-deps` and `npm run dev-benchmark` in zellij if not up. First run seeds bench-small/large/wide (~several minutes).

- [ ] **Step 2: Read baseline** (3 runs to check stability):

```sh
npm run benchmark -- --scenarios=reads --duration=15
```

- [ ] **Step 3: Write baseline**:

```sh
npm run benchmark -- --scenarios=writes
npm run benchmark -- --scenarios=single-line-writes,wide-single-line-writes --duration=60
```

- [ ] **Step 4: Write `benchmark/results/BASELINE.md`:** table of all scenario numbers (median of the read runs), the per-step server-side breakdown for `simple-list`, `large-page-json`, `large-page-csv`, and a "findings ↔ numbers" section mapping each measured quantity to the scan finding it bounds (T1: `prepareResultItems` step avg; T2: anonymous-vs-session gap; T3: wide-vs-narrow single-line ratio + RSS slope; T4/T9: `indexMs`; T6: duplicates `requestMs`; T12: single-line req/s ceiling). Conclude with the ranked list of experiments to run next (candidate fix branches).

- [ ] **Step 5: Commit**

```sh
git add benchmark/results/BASELINE.md
git commit -m "docs(benchmark): baseline measurements for the perf scan findings"
```

---

## After this plan: experiment protocol (next phase, not in scope here)

One branch per candidate fix, e.g. `perf-exp-t1-result-context`. For each: implement the minimal fix → run only the scenarios mapped to that finding (×3) → compare against BASELINE.md → record the delta in `benchmark/results/EXPERIMENTS.md` → keep or discard. Priority order from the scan: T1 (wire prepareResultContext), T3 (memoize compileSchema), T2 (token cache in lib-node), T4 (batch MarkIndexedStream), T5 (cheap ETag), T6 (Set + remove sleep), then T7-T9.

## Self-review notes

- Spec coverage: scan-notes "Suggested benchmark additions" 1→Task 5, 2→Task 6, 3→Task 7 (bulk-ndjson-unique), 4→Task 7 (duplicates), 5→Task 7 (bulk-patch), 6→Task 8, 7 (wide variants)→Tasks 6+8, 8 (memory guard)→RSS deltas in Task 4 + Task 8 verification; profiling support→Tasks 4+9. History-on variant (scan item 7b) deliberately deferred — needs `rest.history` dataset config, add during the T20 experiment if pursued.
- The `expectStatus: 201` for POST /lines is a documented uncertainty — verify live (Task 8 step 2 note).
- Type/name consistency: `BenchContext`, `HttpRequestSpec`, `StepDelta`, `waitForLinesTotal(datasetId, expected, timeoutSec, params)`, `recreateDataset(id, schema?)` — all defined before use; `metrics.ts` type-only stub created in Task 3 so reporter.ts compiles before Task 4.
