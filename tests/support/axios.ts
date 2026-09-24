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

/** Get the full URL for a mock application (e.g. mockAppUrl('monapp1') → 'http://localhost:8999/monapp1/') */
export const mockAppUrl = (name: string) => `${mockUrl}/${name}/`

/** Get the base-application ID for a mock app (slugified URL) */
export const mockAppId = (name: string) => slug(`${mockUrl}/${name}/`, { lower: true })

const axiosOpts = { baseURL }

export const axios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })
export const anonymousAx = axios()

export const axiosAuth = async (email: string, org?: string, adminMode = false, opts = {}) => {
  return await _axiosAuth({
    email,
    password: 'passwd',
    directoryUrl,
    org,
    axiosOpts: { ...axiosOpts, headers: { 'x-cache-bypass': '1' }, ...opts },
    adminMode
  })
}

export const waitForWorkerIdle = async (timeoutMs = 5000): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`)
    const allEmpty = Object.values(res.data).every((pending: any) => Object.keys(pending).length === 0)
    if (allEmpty) return true
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
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

export const checkPendingTasks = async (timeoutMs = 30000) => {
  // some test paths legitimately leave a finalize task in-flight (e.g. a successful REST line POST
  // sets _partialRestStatus: 'indexed' which the shortProcessor picks up asynchronously). A task that
  // is still running is not a leak, so keep polling for the whole window and only report what is
  // still pending at the end: waiting a flat 5s and then asserting once reported a slow finalize as
  // a leak, which is where this check was failing intermittently.
  if (await waitForWorkerIdle(timeoutMs)) return
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`)
  for (const [worker, pending] of Object.entries(res.data)) {
    if (Object.keys(pending as any).length > 0) {
      throw new Error(`pending tasks remaining in worker "${worker}" after ${timeoutMs}ms: ${JSON.stringify(pending)}`)
    }
  }
}
