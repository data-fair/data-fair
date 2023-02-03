const CacheableLookup = require('cacheable-lookup')
const AgentKeepAlive = require('agentkeepalive')
const https = require('https')

// HTTP agent performance, cf https://github.com/nodejitsu/node-http-proxy/issues/1058
// use agent keepalive only for http (meaning probably internal to the infrastructure)
// if by mistake we also use https (reentrant) it is better not to saturate the reverse proxy with opened sockets
const httpAgent = new AgentKeepAlive({
  maxSockets: 128,
  maxFreeSockets: 128,
  timeout: 60000, // active socket keepalive for 60 seconds
  freeSocketTimeout: 30000 // free socket keepalive for 30 seconds
})

const httpsAgent = new https.Agent({})

const cacheableLookup = new CacheableLookup()
cacheableLookup.install(httpAgent)
cacheableLookup.install(httpsAgent)

module.exports = { httpAgent, httpsAgent }
