import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import _slug from 'slugify'
const slug = _slug as unknown as (str: string, opts?: Record<string, any>) => string

/**
 * Test users and orgs are defined in:
 *   - dev/resources/users.json — user accounts (test_user1..test_user10, test_alone, test_user, test_contrib, test_superadmin, albanm,
 *     plus kml_admin / kml_user / kml_{data,support,marketing}_{admin,contrib}[/user] / kml_multi_admin for koumoul-org dept testing).
 *     All use password 'passwd'.
 *   - dev/resources/organizations.json — org memberships and roles (test_org1..test_org6, koumoul with depts data/support/marketing)
 *
 * These are loaded by simple-directory (see docker-compose.yaml, STORAGE_TYPE=file).
 */

export const directoryUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/simple-directory`
export const apiUrl = `http://localhost:${process.env.DEV_API_PORT}`
export const baseURL = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`
export const wsUrl = `ws://localhost:${process.env.DEV_API_PORT}`
export const mockUrl = `http://localhost:${process.env.MOCK_PORT}`

/** Canonical url of a mock base application, now served by data-fair itself from the registry artefact */
export const mockAppUrl = (name: string) => `${baseURL}/app-assets/@test/${name}/0.1/`

/** The id of the base application (slug of its canonical url) */
export const mockAppId = (name: string) => slug(mockAppUrl(name), { lower: true })

const axiosOpts = { baseURL }

// Regression harness: with FORCE_STREAM=1 in the env, append `?_stream=true` to every `/lines` GET so the
// whole suite exercises the streamed source (json/csv/geojson) instead of the default buffered path — the
// per-request opt-in is functionally identical to enabling experimental.streamReadLines. Ineligible formats
// (pbf/xlsx/ods) ignore `_stream`, so this only flips the eligible reads. No effect unless FORCE_STREAM is set.
const forceStream = !!process.env.FORCE_STREAM
const installForceStream = (ax: any) => {
  if (forceStream && ax?.interceptors) {
    ax.interceptors.request.use((cfg: any) => {
      // skip requests that already carry _stream (in the URL or in params): the server rejects duplicate
      // query parameters with a 400, and stream-read-lines.api.spec.ts sets _stream=true explicitly.
      if ((cfg.method ?? 'get').toLowerCase() === 'get' && /\/lines(\?|$)/.test(cfg.url ?? '') &&
        !/[?&]_stream=/.test(cfg.url ?? '') && cfg.params?._stream === undefined) {
        cfg.params = { ...(cfg.params ?? {}), _stream: 'true' }
      }
      return cfg
    })
  }
  return ax
}

export const axios = (opts = {}) => installForceStream(axiosBuilder({ ...axiosOpts, ...opts }))
export const anonymousAx = axios()

export const axiosAuth = async (email: string, org?: string, adminMode = false, opts = {}) => {
  return installForceStream(await _axiosAuth({
    email,
    password: 'passwd',
    directoryUrl,
    org,
    axiosOpts: { ...axiosOpts, headers: { 'x-cache-bypass': '1' }, ...opts },
    adminMode
  }))
}

export const waitForWorkerIdle = async (timeoutMs = 5000): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`)
    const allEmpty = Object.values(res.data).every((pending: any) => Object.keys(pending).length === 0)
    if (allEmpty) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export const clean = async () => {
  await waitForWorkerIdle()
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env`)
}

export const config = {
  publicUrl: baseURL,
  directoryUrl,
  secretKeys: { identities: 'identities-test-key', limits: 'limits-test-key' },
  cache: { publicMaxAge: 1, timestampedPublicMaxAge: 604800 },
  defaultRemoteKey: { in: 'header', name: 'x-apiKey', value: 'test_default_key' },
}

export const checkPendingTasks = async () => {
  // some test paths legitimately leave a finalize task in-flight (e.g. a successful REST line POST
  // sets _partialRestStatus: 'indexed' which the shortProcessor picks up asynchronously). Give workers
  // the same idle grace period clean() uses before asserting — anything still pending after 5s is a leak.
  await waitForWorkerIdle()
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`)
  for (const [worker, pending] of Object.entries(res.data)) {
    if (Object.keys(pending as any).length > 0) {
      throw new Error(`pending tasks remaining in worker "${worker}": ${JSON.stringify(pending)}`)
    }
  }
}
