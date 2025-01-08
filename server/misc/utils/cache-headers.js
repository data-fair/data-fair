import config from 'config'
import createError from 'http-errors'
import useragent from 'useragent'
import debugLib from 'debug'

const debug = debugLib('cache-headers')

export const setNoCache = (req, res) => {
  res.setHeader('X-Accel-Buffering', 'no')
  // compatibility with older IE
  // cf https://stackoverflow.com/questions/12205632/express-returns-304-for-ie-repeative-requests
  if (useragent.is(req.headers['user-agent']).ie) {
    res.setHeader('Expires', '-1')
    res.setHeader('Cache-Control', 'must-revalidate, private')
  } else {
    res.setHeader('Cache-Control', 'no-cache, private')
  }
}

// adapt headers based on the state of the currently requested resource
// Set max-age
// Also compare last-modified and if-modified-since headers for cache revalidation on a specific resource
// only send data if the dataset was finalized since then
// prevent running expensive queries while always presenting fresh data
// also set last finalized date into last-modified header
export const resourceBased = (dateKey = 'updatedAt') => (req, res, next) => {
  if (req.noCache) {
    setNoCache(req, res)
    return next()
  }

  const dateStr = req.resource[dateKey] || req.resource.updatedAt
  const date = new Date(dateStr)
  const dateUTC = date.toUTCString()
  const cacheVisibility = req.publicOperation ? 'public' : 'private'
  debug(`dateUTC=${dateUTC}, visibility=${cacheVisibility}`)

  const ifModifiedSince = req.get('if-modified-since')
  if (ifModifiedSince && dateUTC === ifModifiedSince) {
    debug('if-modified-since matches local date, return 304')
    return res.status(304).send()
  }
  res.setHeader('Last-Modified', dateUTC)

  if (cacheVisibility === 'public') {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
  } else {
    res.setHeader('X-Accel-Buffering', 'no')
  }

  // finalizedAt passed as query parameter is used to timestamp the query and
  // make it compatible with a longer caching
  const queryDateStr = req.query.finalizedAt || req.query.updatedAt
  if (queryDateStr) {
    debug('date in query parameter, use longer max age', queryDateStr)
    const queryDate = new Date(queryDateStr)
    if (queryDate > date) {
      console.warn(`wrong usage of finalizedAt or updatedAt parameters: query=${JSON.stringify(req.query)}, resource=${{ finalizedAt: req.resource.finalizedAt, updatedAt: req.resource.updatedAt }}`)
      throw createError(400, `"finalizedAt" or "updatedAt" parameter has a value higher in the query than in the resource (${queryDate.toISOString()} > ${date.toISOString()}).`)
    }
    res.setHeader('Cache-Control', `must-revalidate, ${cacheVisibility}, max-age=${config.cache.timestampedPublicMaxAge}`)
  } else {
    if (cacheVisibility === 'public') {
      res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
    } else {
      setNoCache(req, res)
    }
  }

  next()
}

// adapt headers for a request listing the content of a collection
export const listBased = (req, res, next) => {
  const select = req.query.select ? req.query.select.split(',') : []
  let cacheVisibility = 'private'
  if (select.includes('-userPermissions') && req.query.visibility && req.query.visibility.includes('public')) cacheVisibility = 'public'
  if (cacheVisibility === 'public') {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
    res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
  } else {
    setNoCache(req, res)
  }
  next()
}

export const noCache = (req, res, next) => {
  setNoCache(req, res)
  next()
}
