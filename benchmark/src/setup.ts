import './env.ts'
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

let ax: AxiosInstance | undefined

/** Authenticate against the local data-fair and verify connectivity. */
export async function init (): Promise<void> {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await axiosAuth({
    email: 'test_superadmin@test.com',
    password: 'passwd',
    directoryUrl,
    axiosOpts: { baseURL: baseUrl, headers: { 'x-cache-bypass': '1' } }
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
