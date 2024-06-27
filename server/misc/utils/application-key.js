// a midleware to check if the endpoint is called from an application with an unauthenticated readOnly application key
const requestIp = require('request-ip')
const config = require('config')
const asyncWrap = require('./async-handler')
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
  let appId = decodeURIComponent(refererUrl.pathname.replace('/data-fair/app/', '').split('/')[0])
  let applicationKeyId = refererUrl.searchParams && refererUrl.searchParams.get('key')
  if (!applicationKeyId) {
    const keys = appId.split(':')
    if (keys.length > 1) {
      applicationKeyId = keys[0]
      appId = appId.replace(keys[0] + ':', '')
    }
  }
  if (!applicationKeyId) return next()
  const ownerFilter = {
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id,
    'owner.department': req.dataset.owner.department ? req.dataset.owner.department : { $exists: false }
  }
  // TODO: add owner filter ?
  const applicationKey = await req.app.get('db').collection('applications-keys').findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
  if (!applicationKey) return next()
  if (applicationKey._id !== appId) {
    // ths application key can be matched to a parent application key (case of dashboards, etc)
    const isParentApplicationKey = await req.app.get('db').collection('applications').count({ id: applicationKey._id, 'configuration.applications.id': appId, ...ownerFilter })
    if (!isParentApplicationKey) return next()
  }

  const datasetHref = `${config.publicUrl}/api/v1/datasets/${req.dataset.id}`
  const filter = {
    id: appId,
    $or: [{ 'configuration.datasets.href': datasetHref }, { 'configuration.datasets.id': req.dataset.id }],
    ...ownerFilter
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
