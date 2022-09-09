const config = require('config')
const createError = require('http-errors')
const useragent = require('useragent')
// adapt headers based on the state of the currently requested resource
// Set max-age
// Also compare last-modified and if-modified-since headers for cache revalidation on a specific resource
// only send data if the dataset was finalized since then
// prevent running expensive queries while always presenting fresh data
// also set last finalized date into last-modified header
exports.resourceBased = (req, res, next) => {
  const dateStr = req.resource.fullUpdatedAt || req.resource.finalizedAt || req.resource.updatedAt
  const date = new Date(dateStr)
  const dateUTC = date.toUTCString()
  const cacheVisibility = req.publicOperation ? 'public' : 'private'

  const ifModifiedSince = req.get('if-modified-since')
  if (ifModifiedSince && dateUTC === ifModifiedSince) {
    return res.status(304).send()
  }
  res.setHeader('Last-Modified', dateUTC)

  if (cacheVisibility === 'public') {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
  }

  // finalizedAt passed as query parameter is used to timestamp the query and
  // make it compatible with a longer caching, only for datasets
  const queryDateStr = req.query.finalizedAt || req.query.updatedAt
  if (queryDateStr) {
    const queryDate = new Date(queryDateStr)
    if (queryDate > date) {
      console.warn(`wrong usage of finalizedAt or updatedAt parameters: query=${JSON.stringify(req.query)}, resource=${{ fullUpdatedAt: req.resource.fullUpdatedAt, finalizedAt: req.resource.finalizedAt, updatedAt: req.resource.updatedAt }}`)
      throw createError(400, `"finalizedAt" or "updatedAt" parameter has a value higher in the query than in the resource (${queryDate.toISOString()} > ${date.toISOString()}).`)
    }
    res.setHeader('Cache-Control', `must-revalidate, ${cacheVisibility}, max-age=${config.cache.timestampedPublicMaxAge}`)
  } else {
    if (cacheVisibility === 'public') {
      res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
    } else {
      res.setHeader('Expires', '-1')
      res.setHeader('Cache-Control', 'must-revalidate, private')
    }
  }

  next()
}

// cf https://stackoverflow.com/questions/12205632/express-returns-304-for-ie-repeative-requests
exports.noCache = (req, res, next) => {
  if (useragent.is(req.headers['user-agent']).ie) {
    res.setHeader('Expires', '-1')
    res.setHeader('Cache-Control', 'must-revalidate, private')
  }
  next()
}
