const express = require('express')
const requestProxy = require('@koumoul/express-request-proxy')
const config = require('config')
const fs = require('fs')
const path = require('path')
const parse5 = require('parse5')
const { Transform } = require('stream')
const url = require('url')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const applicationAPIDocs = require('../../contract/application-api-docs')
const permissions = require('../utils/permissions')
const thumbor = require('../utils/thumbor')
const serviceWorkers = require('../utils/service-workers')
const router = module.exports = express.Router()
const debug = require('debug')('application-proxy')

const loginHtml = fs.readFileSync(path.join(__dirname, '../resources/login.html'), 'utf8')

const brandEmbed = config.brand.embed && parse5.parseFragment(config.brand.embed)

const setResource = asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications')
    .findOne({ id: req.params.applicationId }, { projection: { _id: 0 } })
  if (!req.application) return res.status(404).send('Application configuration not found')
  findUtils.setResourceLinks(req.application, 'application')
  req.resourceType = 'applications'
  req.resourceApiDoc = applicationAPIDocs(req.application)
  next()
})

router.get('/:applicationId/manifest.json', setResource, permissions.middleware('readConfig', 'read'), asyncWrap(async(req, res) => {
  const cleanApplicationUrl = req.application.url.replace(/\/$/, '')
  res.setHeader('Content-Type', 'application/manifest+json')
  res.send({
    name: req.application.title,
    short_name: req.application.title,
    description: req.application.description,
    start_url: new URL(req.application.exposedUrl).pathname + '/',
    scope: new URL(req.application.exposedUrl).pathname + '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e88e5',
    lang: 'fr',
    icons: ['64x64', '120x120', '144x144', '152x152', '192x192', '384x384', '512x512'].map(sizes => {
      return {
        sizes,
        type: 'image/png',
        src: thumbor.thumbnail(cleanApplicationUrl + '/icon.png', sizes),
      }
    }),
  })
}))

// Login is a special small UI page on /app/appId/login
// this is so that we expose a minimalist password based auth in the scope of the current application
// prevents opening a browser if the app is installed standalone
router.get('/:applicationId/login', setResource, (req, res) => {
  res.setHeader('Content-Type', 'text/html')
  let redirect = encodeURIComponent(`${config.publicUrl}/app/${req.params.applicationId}?`)
  if (req.application.owner.type === 'organization') redirect += `id_token_org=${encodeURIComponent(req.application.owner.id)}&`
  redirect += 'id_token='
  res.send(loginHtml
    .replace('{AUTH_ROUTE}', `${config.directoryUrl}/api/auth/password?redirect=${redirect}`)
    .replace('{LOGO}', `${config.directoryUrl}/api/avatars/${req.application.owner.type}/${req.application.owner.id}/avatar.png`),
  )
})

// Proxy for applications
router.all('/:applicationId*', setResource, (req, res, next) => { req.app.get('anonymSession')(req, res, next) }, asyncWrap(async(req, res, next) => {
  const db = req.app.get('db')

  let matchinApplicationKey = false
  if (req.query.key) {
    const applicationKeys = await db.collection('applications-keys').findOne({ _id: req.application.id })
    matchinApplicationKey = applicationKeys && !!applicationKeys.keys.find(k => k.id === req.query.key)
  }
  if (!permissions.can('applications', req.application, 'readConfig', req.user) && !matchinApplicationKey) {
    return res.redirect(`${config.publicUrl}/app/${req.application.id}/login`)
  }

  // check owner limits
  const limitsPromise = db.collection('limits').findOne({ type: req.application.owner.type, id: req.application.owner.id })

  delete req.application.permissions
  req.application.apiUrl = config.publicUrl + '/api/v1'
  req.application.wsUrl = config.wsPublicUrl
  if (req.query.draft === 'true') {
    req.application.configuration = req.application.configurationDraft || req.application.configuration
  }
  delete req.application.configurationDraft
  const applicationUrl = (req.query.draft === 'true' ? (req.application.urlDraft || req.application.url) : req.application.url)

  // check that the user can access the base appli
  const accessFilter = [
    { public: true },
    { privateAccess: { $elemMatch: { type: req.application.owner.type, id: req.application.owner.id } } },
  ]
  const baseAppPromise = db.collection('base-applications')
    .findOne({ url: applicationUrl, $or: accessFilter }, { projection: { id: 1 } })

  // the dates of last modification / finalization of both the app and the datasets it uses
  const updateDates = [new Date(req.application.updatedAt)]

  // Update the config with dates of last finalization of the used datasets
  // this info can then be used to add ?finalizedAt=... to any queries
  // and so benefit from better caching
  const datasets = req.application.configuration && req.application.configuration.datasets && req.application.configuration.datasets.filter(d => !!d)
  if (datasets && datasets.length) {
    const freshDatasets = await db.collection('datasets')
      .find({ $or: datasets.map(d => ({ id: d.id })) })
      .project({ _id: 0, id: 1, finalizedAt: 1 })
      .toArray()

    freshDatasets.forEach(fd => {
      updateDates.push(new Date(fd.finalizedAt))
      req.application.configuration.datasets.find(d => fd.id === d.id).finalizedAt = fd.finalizedAt
    })
  }

  // we await the promises afterwards so that the datasets and baseApp promises were resolved in parallel
  const limits = await limitsPromise
  const baseApp = await baseAppPromise
  if (!baseApp) return res.status(404).send('Application de base inconnue ou à accès restreint.')

  const ifModifiedSince = req.headers['if-modified-since'] && new Date(req.headers['if-modified-since'])
  // go through UTC transformation to lose milliseconds just as last-modified and if-modified-since headers do
  const updatedAt = new Date(new Date(Math.max(...updateDates)).toUTCString())

  // The configuration (or datasets) was updated since last read of the html file,
  // we need to re-fetch it from backend to be able to re-inject the new configuration
  // so we remove if-modified-since so that the backend will not respond with a 304
  if (ifModifiedSince && (updatedAt > ifModifiedSince)) {
    delete req.headers['if-modified-since']
  }

  findUtils.setResourceLinks(req.application, 'application')
  // Remove trailing slash for more homogeneous rules afterward
  const cleanApplicationUrl = applicationUrl.replace(/\/$/, '')
  const headers = {
    'X-Exposed-Url': req.application.exposedUrl,
    'X-Application-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId,
    'X-Directory-Url': config.directoryUrl,
    'X-API-Url': config.publicUrl + '/api/v1',
    // This header is deprecated, use X-Application-Url instead and concatenate /config to it
    'X-Config-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId + '/config',
    'accept-encoding': 'identity',
  }
  const options = {
    url: cleanApplicationUrl + '/*',
    headers,
    timeout: config.remoteTimeout,
  }

  const originalUrl = url.parse(req.originalUrl)
  // Trailing / are removed by express...
  // we want them with added index.html
  if (req.params['0'] === '') {
    req.params['0'] = '/index.html'
  } else if (originalUrl.pathname.endsWith('/')) {
    req.params['0'] += '/index.html'
  }

  // We never transmit authentication
  delete req.headers.authorization
  delete req.headers.cookie

  // Remember active sessions
  if (req.session) {
    // temporarily empty previous sessions where applications were stored as strings
    req.session.activeApplications = (req.session.activeApplications || []).filter(a => typeof a === 'object')
    if (!req.session.activeApplications.find(a => a.id === req.application.id)) {
      req.session.activeApplications.push({ id: req.application.id, owner: req.application.owner })
    }
  }

  options.transforms = [{
    // fix cache. Remove etag,  calculate last-modified, etc.
    name: 'cache-manager',
    match: (resp) => {
      debug(`Incoming response ${req.originalUrl} - ${resp.statusCode}`)
      delete resp.headers.expires
      delete resp.headers.etag
      resp.headers['cache-control'] = 'private, max-age=0, must-revalidate'
      resp.headers.pragma = 'no-cache'
      if (resp.statusCode !== 200) return false
      const lastModified = resp.headers['last-modified'] && new Date(resp.headers['last-modified'])
      const comparisonDate = lastModified && lastModified > updatedAt ? lastModified : updatedAt
      resp.headers['last-modified'] = comparisonDate.toUTCString()
      if (ifModifiedSince && ifModifiedSince >= comparisonDate) {
        resp.statusCode = 304
      }
      debug(`Cache headers processed: if-modified-since=${ifModifiedSince} - updatedAt=${updatedAt} - last-modified=${lastModified} - statusCode=${resp.statusCode}`)
      return false
    },
    // never actually called
    transform: () => null,
  }, {
    name: 'redirect-fixer',
    match: (resp) => {
      // No permanent redirects, they are a pain for developping, debugging, etc.
      if (resp.statusCode === 301) resp.statusCode = 302

      // Fix redirects
      if (resp.statusCode === 302) {
        resp.headers.location = resp.headers.location.replace(cleanApplicationUrl, req.application.exposedUrl)
        resp.headers.location = resp.headers.location.replace(cleanApplicationUrl.replace('https://', 'http://'), req.application.exposedUrl)
        // for gitlab pages
        resp.headers.location = resp.headers.location.replace(cleanApplicationUrl.replace('https:', ''), req.application.exposedUrl)
      }

      return false
    },
    // never actually called
    transform: () => null,
  }, {
    // Transform HTML content from response to inject params.
    // Usefull for client-side only applications that cannot read the headers.
    name: 'config-injector',
    match: (resp) => {
      // Do not attempt to transform errors or redirects
      if (resp.statusCode !== 200) return false

      // Do not transform compressed content
      if (resp.headers['content-encoding'] && resp.headers['content-encoding'] !== 'identity') {
        console.error(`A proxied application (${req.originalUrl}) sent compressed data (${resp.headers['content-encoding']})`)
        return false
      }

      // force HTML content type as CDN might not respect it
      if (req.params['0'].endsWith('.html')) {
        resp.headers['content-type'] = 'text/html; charset=utf-8'
      }

      // Only transform HTML
      return !resp.headers['content-type'] || (resp.headers['content-type'].indexOf('text/html') === 0)
    },
    transform: () => {
      return new Transform({
        transform(chunk, encoding, callback) {
          this.str = (this.str || '') + chunk
          callback()
        },
        flush(callback) {
          let document
          try {
            document = parse5.parse(this.str.replace(/%APPLICATION%/, JSON.stringify(req.application)))
          } catch (err) {
            return callback(err)
          }
          const html = document.childNodes.find(c => c.tagName === 'html')
          if (!html) return callback(new Error('HTML structure is broken, expect html, head and body elements'))
          const head = html.childNodes.find(c => c.tagName === 'head')
          const body = html.childNodes.find(c => c.tagName === 'body')
          if (!head || !body) return callback(new Error('HTML structure is broken, expect html, head and body elements'))

          // Data-fair generates a manifest per app
          const manifestUrl = new URL(req.application.exposedUrl).pathname + '/manifest.json'
          const manifest = head.childNodes.find(c => c.attrs && c.attrs.find(a => a.name === 'rel' && a.value === 'manifest'))
          if (manifest) {
            manifest.attrs.find(a => a.name === 'href').value = manifestUrl
          } else {
            head.childNodes.push({
              nodeName: 'link',
              tagName: 'link',
              attrs: [
                { name: 'rel', value: 'manifest' },
                { name: 'crossorigin', value: 'use-credentials' },
                { name: 'href', value: manifestUrl },
              ],
            })
          }

          // Data-fair also generates a basic service-workers configuration per app
          head.childNodes.push({
            nodeName: 'script',
            tagName: 'script',
            attrs: [{ name: 'type', value: 'text/javascript' }],
            childNodes: [{
              nodeName: '#text',
              value: serviceWorkers.register(req.application),
            }],
          })

          head.childNodes.push({
            nodeName: 'meta',
            tagName: 'meta',
            attrs: [
              { name: 'name', value: 'referrer' },
              { name: 'content', value: 'same-origin' },
            ],
          })

          // add a brand logo somewhere over the applications
          const hideBrand = (limits && limits.hide_brand && limits.hide_brand.limit) || config.defaultLimits.hideBrand
          if (brandEmbed && !hideBrand) {
            brandEmbed.childNodes.forEach(childNode => body.childNodes.push(childNode))
          }

          callback(null, parse5.serialize(document))
        },
      })
    },
  }]

  requestProxy(options)(req, res, err => {
    if (err) console.error('Error while proxying application', err)
    next(err)
  })
}))
