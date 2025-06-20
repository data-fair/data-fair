import config from '#config'
import { Transform } from 'node:stream'
import { RateLimiter, TokenBucket } from 'limiter' // cf https://github.com/jhurliman/node-rate-limiter/issues/80#issuecomment-1649261071
import requestIp from 'request-ip'
import debug from 'debug'

const debugLimits = debug('limits')

// IMPORTANT NOTE: all rate limiting is based on memory only, to be strictly applied when scaling the service
// load balancing has to be based on a hash of the rate limiting key i.e the origin IP

const rateLimiters = {}

const tokenBuckets = {}

// simple cleanup of the limiters every 20 minutes
setInterval(() => {
  const threshold = Date.now() - 20 * 60 * 1000
  for (const key of Object.keys(rateLimiters)) {
    if (rateLimiters[key].lastUsed < threshold) delete rateLimiters[key]
  }
  for (const key of Object.keys(tokenBuckets)) {
    if (tokenBuckets[key].lastUsed < threshold) delete tokenBuckets[key]
  }
}, 20 * 60 * 1000)

export const clear = () => {
  for (const key of Object.keys(rateLimiters)) delete rateLimiters[key]
  for (const key of Object.keys(tokenBuckets)) delete tokenBuckets[key]
}

export const getRateLimiter = (req, limitType, throttlingKey = '') => {
  const throttlingId = throttlingKey + '_' + (req.user ? req.user.id : requestIp.getClientIp(req)) + '_' + limitType
  const rateLimiter = rateLimiters[throttlingId] = rateLimiters[throttlingId] || {
    rateLimiter: new RateLimiter({
      tokensPerInterval: config.defaultLimits.apiRate[limitType].nb,
      interval: config.defaultLimits.apiRate[limitType].duration * 1000
    })
  }
  return rateLimiter
}

export const consume = (req, limitType, throttlingKey) => {
  const rateLimiter = getRateLimiter(req, limitType, throttlingKey)
  rateLimiter.lastUsed = Date.now()
  return rateLimiter.rateLimiter.tryRemoveTokens(1)
}

const burstFactor = 4
export const getTokenBucket = (req, limitType, bandwidthType) => {
  const throttlingId = req.user ? req.user.id : requestIp.getClientIp(req)
  const bucketSize = config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType] * burstFactor
  const tokenBucket = tokenBuckets[throttlingId + bandwidthType] = tokenBuckets[throttlingId + bandwidthType] || {
    bucketSize,
    bucket: new TokenBucket({
      bucketSize,
      tokensPerInterval: config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType],
      interval: 1000
    })
  }
  return tokenBucket
}

class Throttle extends Transform {
  constructor (tokenBucket) {
    super()
    this.tokenBucket = tokenBucket
  }

  async transformPromise (chunk, encoding, callback) {
    this.tokenBucket.lastUsed = Date.now()
    let pos = 0
    while (chunk.length > pos) {
      const slice = chunk.subarray(pos, pos + this.tokenBucket.bucketSize)
      await this.tokenBucket.bucket.removeTokens(slice.length)
      this.push(slice)
      pos += slice.length
    }
  }

  _transform (chunk, encoding, cb) {
    this.transformPromise(chunk, encoding).then(() => cb(), cb)
  }
}

const throttledEnd = async (res, buffer, tokenBucket) => {
  let pos = 0
  while (buffer.length > pos) {
    const slice = buffer.subarray(pos, pos + tokenBucket.bucketSize)
    await tokenBucket.bucket.removeTokens(slice.length)
    res.write(slice)
    pos += slice.length
  }
  res._originalEnd()
}

export const middleware = (_limitType) => async (req, res, next) => {
  const limitType = _limitType || ((req.user && req.user.id) ? 'user' : 'anonymous')

  const ignoreRateLimiting = config.secretKeys.ignoreRateLimiting && req.get('x-ignore-rate-limiting') === config.secretKeys.ignoreRateLimiting
  if (!ignoreRateLimiting && !consume(req, limitType)) {
    debugLimits('exceedRateLimiting', limitType, req.user, requestIp.getClientIp(req))
    return res.status(429).type('text/plain').send(req.__('errors.exceedRateLimiting'))
  }

  res.throttle = (bandwidthType) => {
    const throttle = new Throttle(getTokenBucket(req, limitType, bandwidthType))
    throttle.on('error', () => {
      // nothing, throttle might finish in error if the HTTP request was interrupted or somethin like that
      // we don't care about ERR_STREAM_PREMATURE_CLOSE errors, etc
    })
    return throttle
  }
  res.throttleEnd = (bandwidthType = 'dynamic') => {
    if (ignoreRateLimiting) return

    // prevent inifinite loop if res.throttleEnd is called twice
    if (res._originalEnd) return

    res._originalEnd = res.end
    res.end = function (buffer) {
      if (!buffer) return res._originalEnd()
      const tokenBucket = getTokenBucket(req, limitType, bandwidthType)
      tokenBucket.lastUsed = Date.now()
      throttledEnd(res, buffer, tokenBucket)
        .catch(err => console.warn('failed to send throttled response', err))
    }
  }
  next()
}
