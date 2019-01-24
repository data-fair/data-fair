const express = require('express')
const requestProxy = require('express-request-proxy')
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

const loginHtml = fs.readFileSync(path.join(__dirname, '../resources/login.html'), 'utf8')

const setResource = asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications')
    .findOne({ id: req.params.applicationId }, { projection: { _id: 0 } })
  if (!req.application) return res.status(404).send('Application configuration not found')
  findUtils.setResourceLinks(req.application, 'application')
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
        src: thumbor.thumbnail(cleanApplicationUrl + '/icon.png', sizes)
      }
    })
  })
}))

// Login is a special small UI page on /app/appId/login
// this is so that we expose a minimalist password based auth in the scope of the current application
// prevents opening a browser if the app is installed standalone
router.get('/:applicationId/login', (req, res) => {
  res.setHeader('Content-Type', 'text/html')
  const redirect = encodeURIComponent(`${config.publicUrl}/app/${req.params.applicationId}?id_token=`)
  res.send(loginHtml
    .replace('{AUTH_ROUTE}', `${config.directoryUrl}/api/auth/password?redirect=${redirect}`)
    .replace('{LOGO}', config.brand.logo || `${config.publicUrl}/logo.svg`)
  )
})

router.get('/:applicationId-sw.js', setResource, permissions.middleware('readConfig', 'read'), asyncWrap(async(req, res) => {
  res.setHeader('Content-Type', 'application/javascript')
  res.send(serviceWorkers.sw(req.application))
}))

// Proxy for applications
router.all('/:applicationId*', setResource, (req, res, next) => { req.app.get('anonymSession')(req, res, next) }, asyncWrap(async(req, res, next) => {
  if (!permissions.can(req.application, 'readConfig', 'read', req.user)) {
    return res.redirect(`${config.publicUrl}/app/${req.application.id}/login`)
  }
  delete req.application.permissions
  req.application.apiUrl = config.publicUrl + '/api/v1'
  if (req.query.draft === 'true') {
    req.application.configuration = req.application.configurationDraft || req.application.configuration
  }
  delete req.application.configurationDraft

  const ifModifiedSince = new Date(req.get('If-Modified-Since'))
  // go through UTC transformation to lose milliseconds just as last-modified and if-modified-since headers do
  const updatedAt = new Date(new Date(req.application.updatedAt).toUTCString())

  // The configuration was updated since last read of the html file,
  // we need to re-fetch it from backend to be able to re-inject the new configuration
  // so we remove if-modified-since so that the backend will not respond with a 304
  if (ifModifiedSince && (updatedAt > ifModifiedSince)) {
    delete req.headers['if-modified-since']
  }

  findUtils.setResourceLinks(req.application, 'application')
  // Remove trailing slash for more homogeneous rules afterward
  const cleanApplicationUrl = req.application.url.replace(/\/$/, '')
  const headers = {
    'X-Exposed-Url': req.application.exposedUrl,
    'X-Application-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId,
    'X-Directory-Url': config.directoryUrl,
    'X-API-Url': config.publicUrl + '/api/v1',
    // This header is deprecated, use X-Application-Url instead and concatenate /config to it
    'X-Config-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId + '/config',
    'accept-encoding': 'identity'
  }
  const options = { url: cleanApplicationUrl + '/*', headers }

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
    req.session.activeApplications = req.session.activeApplications || []
    if (!req.session.activeApplications.includes(req.application.id)) req.session.activeApplications.push(req.application.id)
  }

  options.transforms = [{
    // fix cache. Remove etag,  calculate last-modified, etc.
    name: 'cache-manager',
    match: (resp) => {
      delete resp.headers.expires
      delete resp.headers.etag
      resp.headers['cache-control'] = 'private, max-age=0'
      const lastModified = new Date(resp.headers['last-modified'] || req.application.updatedAt)
      if (resp.statusCode !== 200) return false
      if (updatedAt > lastModified) {
        resp.headers['last-modified'] = updatedAt.toUTCString()
      } else {
        resp.headers['last-modified'] = lastModified.toUTCString()
      }
      if (ifModifiedSince >= updatedAt && ifModifiedSince >= lastModified) {
        resp.statusCode = 304
      }
      return false
    },
    // never actually called
    transform: () => null
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
    transform: () => null
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
          const head = document.childNodes.find(c => c.tagName === 'html').childNodes.find(c => c.tagName === 'head')
          if (!head) return callback(new Error('HTML structure is broken, expect html and head elements'))

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
                { name: 'href', value: manifestUrl }
              ]
            })
          }

          // Data-fair also generates a basic service-workers configuration per app
          head.childNodes.push({
            nodeName: 'script',
            tagName: 'script',
            attrs: [{ name: 'type', value: 'text/javascript' }],
            childNodes: [{
              nodeName: '#text',
              value: serviceWorkers.register(req.application)
            }]
          })

          callback(null, parse5.serialize(document))
        }
      })
    }
  }]

  requestProxy(options)(req, res, next)
}))
