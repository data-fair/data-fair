import config from '#config'
import CacheableLookup from 'cacheable-lookup'
import { HttpAgent } from 'agentkeepalive'
import https from 'https'

// public agents, the default: they refuse non public addresses (SSRF protection)
// use them for every URL that a user or remote content can influence
// cf @data-fair/lib-node http-agents and SSRF_PUBLIC_IPS / SSRF_PRIVATE_IPS
export { httpAgent, httpsAgent } from '@data-fair/lib-node/http-agents.js'

// private agents: only for URLs from the configuration (other services of the infrastructure, private mappings)
// HTTP agent performance, cf https://github.com/nodejitsu/node-http-proxy/issues/1058
// use agent keepalive only for http (meaning probably internal to the infrastructure)
// if by mistake we also use https (reentrant) it is better not to saturate the reverse proxy with opened sockets
export const privateHttpAgent = new HttpAgent(config.agentkeepaliveOptions)

export const privateHttpsAgent = new https.Agent({})

const cacheableLookup = new CacheableLookup()
cacheableLookup.install(privateHttpAgent)
cacheableLookup.install(privateHttpsAgent)
