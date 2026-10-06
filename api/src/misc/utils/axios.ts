// reuse the shared axios instance from @data-fair/lib-node

import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { privateHttpAgent, privateHttpsAgent } from './http-agents.ts'

// public instance, the default: refuses non public addresses (SSRF protection)
// use it for every URL that a user or remote content can influence
export default axiosBuilder()

// private instance: only for URLs from the configuration (other services of the infrastructure, private mappings)
// keeps our own agents so the configurable socket limits and the non-keepalive https agent are preserved
export const privateAxios = axiosBuilder({ httpAgent: privateHttpAgent, httpsAgent: privateHttpsAgent })
