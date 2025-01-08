import config from 'config'
import CacheableLookup from 'cacheable-lookup'
import AgentKeepAlive from 'agentkeepalive'
import https from 'https'

// HTTP agent performance, cf https://github.com/nodejitsu/node-http-proxy/issues/1058
// use agent keepalive only for http (meaning probably internal to the infrastructure)
// if by mistake we also use https (reentrant) it is better not to saturate the reverse proxy with opened sockets
export const httpAgent = new AgentKeepAlive(config.agentkeepaliveOptions)

export const httpsAgent = new https.Agent({})

const cacheableLookup = new CacheableLookup()
cacheableLookup.install(httpAgent)
cacheableLookup.install(httpsAgent)
