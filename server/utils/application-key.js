// a midleware to check if the endpoint is called from an application with an unauthenticated readOnly application key
const requestIp = require('request-ip')
const config = require('config')
const asyncWrap = require('./async-wrap')
const rateLimiting = require('./rate-limiting')

const matchingHost = (req) => {
  if (!req.headers.origin) return true
  if (req.publicBaseUrl.startsWith(req.headers.origin)) return true
  return false
}

module.exports = asyncWrap(async (req, res, next) => {
  const referer = req.headers.referer || req.headers.referrer
  if (!referer) return next()
  let refererUrl
  try {
    refererUrl = new URL(referer)
  } catch (err) {
    // invalid URL in referer header, it happens
  }
  if (!refererUrl) return next()
  if (!refererUrl.pathname.startsWith('/data-fair/app/')) return next()
  const appId = decodeURIComponent(refererUrl.pathname.replace('/data-fair/app/', '').split('/')[0])
  const key = refererUrl.searchParams && refererUrl.searchParams.get('key')
  let applicationKeys, applicationKey
  if (key) {
    applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ _id: appId, 'keys.id': key })
    if (applicationKeys) applicationKey = applicationKeys.keys.find(ak => ak.id === key)
  } else {
    const keys = appId.split(':')
    if (keys.length > 1) {
      applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ _id: appId.replace(keys[0] + ':', ''), 'keys.id': keys[0] })
      if (applicationKeys) applicationKey = applicationKeys.keys.find(ak => ak.id === keys[0])
    }
  }
  if (!applicationKeys || !applicationKey) return next()

  const datasetHref = `${config.publicUrl}/api/v1/datasets/${req.dataset.id}`
  const filter = {
    id: applicationKeys._id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id,
    $or: [{ 'configuration.datasets.href': datasetHref }, { 'configuration.datasets.id': req.dataset.id }]
  }
  const matchingApplication = await req.app.get('db').collection('applications')
    .findOne(filter, { projection: { 'configuration.datasets': 1 } })
  if (matchingApplication) {
    // this is basically the "crowd-sourcing" use case
    // we apply some anti-spam protection
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // 1rst level of anti-spam prevention, no cross origin requests on this route
      if (!matchingHost(req)) {
        return res.status(405).send(req.__('errors.noCrossDomain'))
      }

      // 2nd level of anti-spam protection, validate that the user was present on the page for a few seconds before sending
      const { verifyToken } = req.app.get('session')
      if (!req.get('x-anonymousToken')) return res.status(401).type('text/plain').send(req.__('errors.requireAnonymousToken'))
      try {
        await verifyToken(req.get('x-anonymousToken'))
      } catch (err) {
        if (err.name === 'NotBeforeError') {
          return res.status(429).type('text/plain').send(req.__('errors.looksLikeSpam'))
        } else {
          return res.status(401).type('text/plain').send('Invalid token')
        }
      }

      // 3rd level of anti-spam protection, simple rate limiting based on ip
      if (!rateLimiting.consume(req, 'postApplicationKey')) {
        console.warn('Rate limit error for application key', requestIp.getClientIp(req), req.originalUrl)
        return res.status(429).type('text/plain').send(req.__('errors.exceedAnonymousRateLimiting'))
      }
    }

    // apply some permissions based on app configuration
    // some dataset might need to be readable, some other writable only for createLine, etc
    const matchingApplicationDataset = matchingApplication.configuration.datasets.find(d => d.href === datasetHref)
    req.bypassPermissions = matchingApplicationDataset.applicationKeyPermissions || { classes: ['read'] }
    req.user = req.user || {
      id: applicationKey.id,
      name: applicationKey.title,
      isApplicationKey: true
    }
  }
  next()
})
