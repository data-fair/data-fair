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
  if (referer) {
    const refererUrl = new URL(referer)
    const key = refererUrl && refererUrl.searchParams && refererUrl.searchParams.get('key')
    if (key) {
      const applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ 'keys.id': key })
      if (applicationKeys) {
        const datasetHref = `${config.publicUrl}/api/v1/datasets/${req.dataset.id}`
        const filter = {
          id: applicationKeys._id,
          'owner.type': req.dataset.owner.type,
          'owner.id': req.dataset.owner.id,
          'configuration.datasets.href': datasetHref
        }
        const matchingApplication = await req.app.get('db').collection('applications')
          .findOne(filter, { projection: { 'configuration.datasets': 1 } })
        if (matchingApplication) {
          // this is basically the "crowd-sourcing" use case
          // we apply some anti-spam protection
          if (req.method === 'POST') {
            // 1rst level of anti-spam prevention, no cross origin requests on this route
            if (!matchingHost(req)) {
              return res.status(405).send('Appel depuis un domaine extérieur non supporté')
            }

            // 2nd level of anti-spam protection, validate that the user was present on the page for a few seconds before sending
            const { verifyToken } = req.app.get('session')
            if (!req.get('x-anonymousToken')) return res.status(401).send('Un jeton d\'action anonyme est requis')
            try {
              await verifyToken(req.get('x-anonymousToken'))
            } catch (err) {
              if (err.name === 'NotBeforeError') {
                return res.status(429).send('Message refusé, l\'activité ressemble à celle d\'un robot spammeur.')
              } else {
                return res.status(401).send('Invalid token')
              }
            }

            try {
              // 3rd level of anti-spam protection, simple rate limiting based on ip
              await rateLimiting.postApplicationKey.consume(requestIp.getClientIp(req), 1)
            } catch (err) {
              console.error('Rate limit error for application key', requestIp.getClientIp(req), req.originalUrl, err)
              return res.status(429).send('Trop de messages dans un bref interval. Veuillez patienter avant d\'essayer de nouveau.')
            }
          }

          // apply some permissions based on app configuration
          // some dataset might need to be readable, some other writable only for createLine, etc
          const matchingApplicationDataset = matchingApplication.configuration.datasets.find(d => d.href === datasetHref)
          req.bypassPermissions = matchingApplicationDataset.applicationKeyPermissions || { classes: ['read'] }
          const applicationKey = applicationKeys.keys.find(ak => ak.id === key)
          req.user = req.user || {
            id: applicationKey.id,
            name: applicationKey.title,
            isApplicationKey: true
          }
        }
      }
    }
  }
  next()
})
