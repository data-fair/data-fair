import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'

export const directoryUrl = `http://localhost:${process.env.NGINX_PORT1}/simple-directory`
export const apiUrl = `http://localhost:${process.env.DEV_API_PORT}`
export const baseURL = `http://localhost:${process.env.NGINX_PORT1}/data-fair`
export const wsUrl = `ws://localhost:${process.env.NGINX_PORT1}/data-fair`
export const mockUrl = `http://localhost:${process.env.MOCK_PORT}`

const axiosOpts = { baseURL }

export const axios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })
export const anonymousAx = axios()

export const axiosAuth = (email: string, password = 'passwd', org?: string, adminMode = false, opts = {}) => {
  return _axiosAuth({
    email,
    password,
    directoryUrl,
    org,
    axiosOpts: { ...axiosOpts, headers: { 'x-cache-bypass': '1' }, ...opts },
    adminMode
  })
}

export const clean = async () => {
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
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`)
  for (const [worker, pending] of Object.entries(res.data)) {
    if (Object.keys(pending as any).length > 0) {
      throw new Error(`pending tasks remaining in worker "${worker}": ${JSON.stringify(pending)}`)
    }
  }
}
