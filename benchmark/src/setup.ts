import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import type { AxiosInstance } from 'axios'

const baseUrl = process.env.BENCHMARK_URL || 'http://localhost:3867/data-fair'
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || 'http://localhost:3867/simple-directory'

let ax: AxiosInstance | undefined

/** Authenticate against the local data-fair and verify connectivity. */
export async function init (): Promise<void> {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await axiosAuth({
    email: 'dmeadus0@answers.com',
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
