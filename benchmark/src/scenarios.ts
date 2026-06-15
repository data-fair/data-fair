import { getBaseUrl, getAxios, getAnonAxios, getDirectAxios, getSessionCookie, getApiKey, recreateDataset, seedRows, waitForLinesTotal } from './setup.ts'
import { generateRows, wideSchema } from './seed.ts'
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

const toNdjson = (rows: any[]) => rows.map(r => JSON.stringify(r)).join('\n')

// large bulk requests go directly to the API port: their synchronous mongo phase
// outlives nginx's proxy_read_timeout, and we measure the API anyway
const postBulk = async (ctx: BenchContext, datasetId: string, body: string) => {
  const directAx = getDirectAxios()
  const t0 = performance.now()
  await directAx.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, body, {
    headers: { 'content-type': 'application/x-ndjson' },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  })
  return performance.now() - t0
}

export const scenarios: Scenario[] = [
  { kind: 'http', name: 'simple-list', description: 'Baseline paginated list', request: lines('bench-large', 'size=20') },
  { kind: 'http', name: 'fulltext-search', description: 'Full-text search', request: lines('bench-large', 'q=analyse+population&size=20') },
  { kind: 'http', name: 'filter-eq', description: 'Exact match filter', request: lines('bench-large', 'str2_eq=cat-alpha&size=20') },
  { kind: 'http', name: 'filter-range', description: 'Range filter', request: lines('bench-large', 'num1_gte=200&num1_lte=800&size=20') },
  { kind: 'http', name: 'sort', description: 'Sort by integer field', request: lines('bench-large', 'sort=num1&size=20') },
  { kind: 'http', name: 'deep-pagination', description: 'Deep offset pagination', request: lines('bench-large', 'page=500&size=20&sort=_i') },
  { kind: 'http', name: 'geo-bbox', description: 'Geo bounding box filter', request: lines('bench-large', 'bbox=-5,42,8,51&size=20') },
  { kind: 'http', name: 'combined', description: 'Search + filter + sort combined', request: lines('bench-large', 'q=analyse&num1_gte=100&sort=num1&size=20') },
  { kind: 'http', name: 'small-dataset', description: 'Small dataset baseline', request: lines('bench-small', 'size=20') },

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
  // cheap, non-ES, session-gated endpoint (dataset metadata) so the auth middleware is a real
  // share of the request rather than ~0.2% of an ES /lines call — the lever to expose T2 caching.
  // anon vs session on the SAME endpoint isolates the per-request session-verify cost.
  {
    kind: 'http',
    name: 'auth-anon-cheap',
    description: 'dataset metadata GET, no auth (baseline for auth-session-cheap)',
    request: () => ({ path: '/api/v1/datasets/bench-large' })
  },
  {
    kind: 'http',
    name: 'auth-session-cheap',
    description: 'dataset metadata GET with session cookie (auth-dominated, exposes T2 verify+build cost)',
    request: ctx => ({ path: '/api/v1/datasets/bench-large', headers: { cookie: ctx.sessionCookie } })
  },

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
    name: 'large-page-truncate',
    description: '10000-row JSON page with truncate (legacy per-key schema scans, T1 worst case)',
    request: lines('bench-large', 'size=10000&truncate=50')
  },
  {
    kind: 'http',
    name: 'wide-list',
    description: '100 rows of a 300-column dataset (schema-scan sensitivity, T1/T16)',
    request: lines('bench-wide', 'size=100')
  },

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

  // --- single-line writes: ajv compile per request (T3), sync index + refresh wait_for (T12), events-log (T22) ---
  {
    kind: 'http',
    name: 'single-line-writes',
    description: 'concurrent POST /lines, unique ids (T3 compile/leak + T12 wait_for); watch rssDelta across runs',
    prepare: async () => { await recreateDataset('bench-single') },
    // no _id in the body: the API generates a nanoid per line. autocannon's
    // idReplacement corrupts content-length when the generated id length differs
    request: ctx => ({
      path: '/api/v1/datasets/bench-single/lines',
      method: 'POST',
      headers: { cookie: ctx.sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ str1: 'analyse population', str2: 'cat-alpha', num1: 42, num2: 3.14, date1: '2024-01-15', lat: 45.1, lon: 1.5 })
    }),
    expectStatus: 201
  },
  {
    kind: 'http',
    name: 'wide-single-line-writes',
    description: 'concurrent POST /lines on the 300-column dataset (ajv compile cost scales with schema, T3)',
    prepare: async () => { await recreateDataset('bench-single-wide', wideSchema) },
    request: ctx => {
      const body: Record<string, any> = {}
      for (let c = 0; c < 300; c++) body[`col${c}`] = c % 3 === 2 ? 7 : 'v'
      return {
        path: '/api/v1/datasets/bench-single-wide/lines',
        method: 'POST',
        headers: { cookie: ctx.sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }
    },
    expectStatus: 201
  }
]
