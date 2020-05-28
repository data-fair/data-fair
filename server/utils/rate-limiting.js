const config = require('config')
const { RateLimiterMongo, RateLimiterMemory } = require('rate-limiter-flexible')
const requestIp = require('request-ip')
const { ThrottleGroup } = require('stream-throttle')
const { promisify } = require('util')
const finished = promisify(require('stream').finished)
const asyncWrap = require('./async-wrap')

// remote services was implemented first, it does not use throttling only rate limiting
// this rate limiting is based on a mongodb storage to truly enforce these limits event if data-fair is scaled
const _remoteServices = {}
exports.remoteServices = (mongoClient) => {
  _remoteServices.kb = _remoteServices.kb || new RateLimiterMongo({
    storeClient: mongoClient,
    keyPrefix: 'data-fair-rate-limiter-kb',
    points: config.defaultLimits.remoteServiceRate.kb * 1000,
    duration: config.defaultLimits.remoteServiceRate.duration,
  })

  _remoteServices.nb = new RateLimiterMongo({
    storeClient: mongoClient,
    keyPrefix: 'data-fair-rate-limiter-remote-services-nb',
    points: config.defaultLimits.remoteServiceRate.nb,
    duration: config.defaultLimits.remoteServiceRate.duration,
  })
  return _remoteServices
}

// other parts of the API are protected only using in memory restrictions for performance
const _limiters = {}
const _throttleGroups = {}
exports.middleware = asyncWrap(async (req, res, next) => {
    const limitType = req.user && req.user.id ? 'user' : 'anonymous'
    const throttlingId = limitType === 'user' ? req.user.id : requestIp.getClientIp(req)

    _limiters[limitType] = _limiters[limitType] || new RateLimiterMemory({
      points: config.defaultLimits.apiRate[limitType].nb,
      duration: config.defaultLimits.apiRate[limitType].duration,
    })
    try {
      await _limiters[limitType].consume(throttlingId, 1)
    } catch (err) {
      return res.status(429).send('Trop de traffic dans un interval restreint sur cette API.')
    }

    res.throttle = (bandwidthType) => {
      const groupInfo = _throttleGroups[throttlingId + bandwidthType] = _throttleGroups[throttlingId + bandwidthType] || {
        group: new ThrottleGroup({ rate: config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType] }),
        nb: 0,
      }
      groupInfo.nb += 1
      const throttle = groupInfo.group.throttle()
      finished(throttle).then(() => {
        groupInfo.nb -= 1
        if (groupInfo.nb === 0) delete _throttleGroups[throttlingId + bandwidthType]
      })
      return throttle
    }
    res.throttleEnd = () => {
      const throttle = res.throttle('dynamic')
      res._originalEnd = res.end
      res.end = function() {
        if (!arguments[0]) return res._originalEnd(...arguments)
        throttle.pipe(res)
        throttle.end(...arguments)
      }
    }
    next()
  })
