// reuse the shared axios instance from @data-fair/lib-node but keep our own http agents
// so the configurable socket limits and the non-keepalive https agent are preserved

import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { httpAgent, httpsAgent } from './http-agents.ts'

export default axiosBuilder({ httpAgent, httpsAgent })
