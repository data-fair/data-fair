import './env.ts'
import { URL } from 'node:url'
import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import type { AxiosInstance } from 'axios'

// The harness auto-discovers the dev environment from the repo .env (loaded by
// ./env.ts): DEV_HOST + NGINX_PORT1 give the reverse-proxy base URL.
// BENCHMARK_URL / BENCHMARK_DIRECTORY_URL override.
const proxyBase = process.env.DEV_HOST && process.env.NGINX_PORT1
  ? `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
  : 'http://localhost:8080'
const baseUrl = process.env.BENCHMARK_URL || `${proxyBase}/data-fair`
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || `${proxyBase}/simple-directory`

const credentials = { email: 'test_superadmin@test.com', password: 'passwd' }

// `axiosAuth` is cookie-based (a simple-directory id_token) with no refresh, so a long
// seed can outlive the session. `ax` is typed loosely because we touch `.cookieJar`,
// which lives on the axios-with-cookies instance but not on the base AxiosInstance type.
let ax: any

/** Run the simple-directory password login flow, returning a fresh cookie-auth instance. */
async function authenticate (): Promise<any> {
  return axiosAuth({
    email: credentials.email,
    password: credentials.password,
    directoryUrl,
    axiosOpts: { baseURL: baseUrl, headers: { 'x-cache-bypass': '1' } }
  })
}

/**
 * Authenticate against the local data-fair and verify connectivity.
 *
 * The session cookie expires and a multi-million-row seed easily outlives it, so a
 * response interceptor re-authenticates on a 401/403 and retries the request once —
 * fresh cookies are copied into the existing instance's jar so cached `getAxios()`
 * references keep working.
 */
export async function init (): Promise<void> {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await authenticate()

  const sdOrigin = new URL(directoryUrl).origin
  ax.interceptors.response.use(undefined, async (error: any) => {
    const status = error.response?.status ?? error.status
    const config = error.config
    if ((status === 401 || status === 403) && config && !config._benchRetried) {
      config._benchRetried = true
      console.log('[setup] session expired — re-authenticating')
      const fresh = await authenticate()
      for (const cookie of fresh.cookieJar.getCookiesSync(sdOrigin)) {
        ax.cookieJar.setCookieSync(cookie.toString(), sdOrigin)
      }
      return ax.request(config)
    }
    return Promise.reject(error)
  })

  const res = await ax.get('/api/v1/datasets', { params: { size: 0 } })
  console.log(`[setup] connected (${res.data.count} existing datasets)`)
}

export function getAxios (): AxiosInstance {
  if (!ax) throw new Error('setup.init() must be called before getAxios()')
  return ax
}

export function getBaseUrl (): string {
  return baseUrl
}
