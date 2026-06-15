import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import axios from 'axios'
import { benchSchema, generateRows, wideSchema, generateWideRows } from './seed.ts'
import type { AxiosInstance } from 'axios'

// derive default URLs from the repo .env (NGINX_PORT1) so the harness follows dev port assignments
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname)
} catch { /* no .env, rely on explicit BENCHMARK_* vars */ }

const nginxPort = process.env.NGINX_PORT1 || '5307'
const devHost = process.env.DEV_HOST || 'localhost'
const baseUrl = process.env.BENCHMARK_URL || `http://${devHost}:${nginxPort}/data-fair`
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || `http://${devHost}:${nginxPort}/simple-directory`
// direct API port, no nginx: long synchronous requests (large _bulk_lines) outlive
// nginx's proxy_read_timeout, like the test suite we talk to the API directly for those
const apiUrl = process.env.BENCHMARK_API_URL || `http://localhost:${process.env.DEV_API_PORT || '5317'}`

let ax: AxiosInstance
let sessionCookie: string
let apiKey: string

export async function init () {
  console.log(`[setup] connecting to ${baseUrl}`)
  // test users come from dev/resources/users.json, loaded by simple-directory (file storage)
  ax = await axiosAuth({
    email: 'test_user1@test.com',
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
      await waitForDataset(spec.id, d => d.status === 'finalized' && d.count >= spec.count, 300)
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
    // retry on 409: a blocking operation (indexing of the previous batch) can still hold the dataset
    for (let attempt = 0; ; attempt++) {
      try {
        await ax.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, rows.slice(i, i + batchSize))
        break
      } catch (err: any) {
        if (err.status !== 409 || attempt >= 60) throw err
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
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
  // retry on 409: a blocking operation (indexing/finalization of a previous run) can hold the dataset
  for (let attempt = 0; ; attempt++) {
    try {
      await ax.delete(`/api/v1/datasets/${id}`)
      break
    } catch (err: any) {
      if (err.status === 404) break
      if (err.status !== 409 || attempt >= 60) throw err
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await ax.put(`/api/v1/datasets/${id}`, { isRest: true, title: id, schema })
      break
    } catch (err: any) {
      if (err.status !== 409 || attempt >= 60) throw err
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  await waitForDataset(id, d => d.status === 'finalized', 60)
}

export function getBaseUrl () { return baseUrl }
export function getApiUrl () { return apiUrl }
export function getAxios () { return ax }
/** authenticated axios talking directly to the API port (no nginx, no proxy timeouts) */
export function getDirectAxios () {
  return axios.create({ baseURL: apiUrl, headers: { cookie: sessionCookie, 'x-cache-bypass': '1' } })
}
export function getAnonAxios () { return axios.create({ baseURL: baseUrl, validateStatus: () => true }) }
export function getSessionCookie () { return sessionCookie }
export function getApiKey () { return apiKey }
