const express = require('express')
const config = require('config')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const CacheableRequest = require('cacheable-request')
const parse5 = require('parse5')
const { Writable } = require('stream')
const pump = require('util').promisify(require('pump'))
const CacheableLookup = require('cacheable-lookup')
const QuickLRU = require('@alloc/quick-lru')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const permissions = require('../utils/permissions')
const thumbor = require('../utils/thumbor')
const serviceWorkers = require('../utils/service-workers')
const router = module.exports = express.Router()
// const debug = require('debug')('application-proxy')

const cacheableLookup = new CacheableLookup()
const requestStorage = new QuickLRU({ maxSize: 1000 })
const cacheableRequestHTTP = new CacheableRequest(http.request, requestStorage)
const cacheableRequestHTTPS = new CacheableRequest(https.request, requestStorage)

const loginHtml = fs.readFileSync(path.join(__dirname, '../resources/login.html'), 'utf8')

const brandEmbed = config.brand.embed && parse5.parseFragment(config.brand.embed)

const setResource = asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications')
    .findOne({ id: req.params.applicationId }, { projection: { _id: 0 } })
  if (!req.application) return res.status(404).send(req.__('errors.missingApp'))
  findUtils.setResourceLinks(req.application, 'application', req.publicBaseUrl)
  req.resourceType = 'applications'
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
  const redirect = `${req.publicBaseUrl}/app/${req.params.applicationId}`
  let authUrl = `${req.directoryUrl}/api/auth/password?redirect=${redirect}`
  if (req.application.owner.type === 'organization') authUrl += `&org=${encodeURIComponent(req.application.owner.id)}&`
  res.send(loginHtml
    .replace('{ERROR}', req.query.error ? `<p style="color:red">${req.query.error}</p>` : '')
    .replace('{AUTH_ROUTE}', authUrl)
    .replace('{LOGO}', `${req.directoryUrl}/api/avatars/${req.application.owner.type}/${req.application.owner.id}/avatar.png`),
  )
})

// Proxy for applications
router.all('/:applicationId*', setResource, asyncWrap(async(req, res, next) => {
  const db = req.app.get('db')

  let matchinApplicationKey = false
  if (req.query.key) {
    const applicationKeys = await db.collection('applications-keys').findOne({ _id: req.application.id })
    matchinApplicationKey = applicationKeys && !!applicationKeys.keys.find(k => k.id === req.query.key)
  }
  if (!permissions.can('applications', req.application, 'readConfig', req.user) && !matchinApplicationKey) {
    return res.redirect(`${req.publicBaseUrl}/app/${req.application.id}/login`)
  }

  // check owner limits
  const limitsPromise = db.collection('limits').findOne({ type: req.application.owner.type, id: req.application.owner.id })

  delete req.application.permissions
  req.application.apiUrl = req.publicBaseUrl + '/api/v1'
  // TODO: captureUrl should be on same domain too ?
  req.application.captureUrl = config.captureUrl
  req.application.wsUrl = req.publicWsBaseUrl
  if (req.query.draft === 'true') {
    req.application.configuration = req.application.configurationDraft || req.application.configuration
  }
  delete req.application.configurationDraft
  const applicationUrl = (req.query.draft === 'true' ? (req.application.urlDraft || req.application.url) : req.application.url)
  // Remove trailing slash for more homogeneous rules afterward
  const cleanApplicationUrl = applicationUrl.replace(/\/$/, '')

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
    datasets.filter(d => d.href).forEach(d => {
      d.href = d.href.replace(config.publicUrl, req.publicBaseUrl)
    })
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
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))

  const headers = {
    'X-Exposed-Url': req.application.exposedUrl,
    'X-Application-Url': req.publicBaseUrl + '/api/v1/applications/' + req.params.applicationId,
    'X-Directory-Url': config.directoryUrl,
    'X-API-Url': req.publicBaseUrl + '/api/v1',
    // This header is deprecated, use X-Application-Url instead and concatenate /config to it
    'X-Config-Url': req.publicBaseUrl + '/api/v1/applications/' + req.params.applicationId + '/config',
    'accept-encoding': 'identity',
    'cache-control': 'max-age=0',
  }

  // merge incoming an target URL elements
  const incomingUrl = new URL('http://host' + req.url)
  const targetUrl = new URL(cleanApplicationUrl)
  let extraPath = req.params['0']
  if (extraPath === '') extraPath = '/index.html'
  else if (incomingUrl.pathname.endsWith('/')) extraPath += '/index.html'
  targetUrl.pathname = path.join(targetUrl.pathname, extraPath)
  targetUrl.search = incomingUrl.searchParams

  const options = {
    host: targetUrl.host,
    port: targetUrl.port,
    protocol: targetUrl.protocol,
    path: targetUrl.pathname + targetUrl.hash + targetUrl.search,
    timeout: config.remoteTimeout,
    headers,
    lookup: cacheableLookup.lookup,
  }
  await new Promise((resolve, reject) => {
    const cacheAppReq = (targetUrl.protocol === 'http:' ? cacheableRequestHTTP : cacheableRequestHTTPS)(options, async (appRes) => {
      try {
        if (appRes.statusCode === 301 || appRes.statusCode === 302) {
          const location = appRes.headers.location
            .replace(cleanApplicationUrl, req.application.exposedUrl)
            .replace(cleanApplicationUrl.replace('https://', 'http://'), req.application.exposedUrl)
            .replace(cleanApplicationUrl.replace('https:', ''), req.application.exposedUrl) // for gitlab pages
          res.redirect(location)
          await pump(appRes, res)
          return resolve()
        }

        let contentType = appRes.headers['content-type']
        // force HTML content type as CDN might not respect it
        if (!contentType || targetUrl.pathname.endsWith('.html')) {
          contentType = 'text/html; charset=utf-8'
        }
        res.set('content-type', contentType)

        // first some requests that must be forwarded directly
        if (
          appRes.statusCode !== 200 || // Do not attempt to transform errors or redirects
          (appRes.headers['content-encoding'] && appRes.headers['content-encoding'] !== 'identity') || // Do not transform compressed content
          (!contentType.startsWith('text/html'))// only transform html content
        ) {
          ['content-type', 'content-length', 'pragma', 'cache-control', 'expires', 'last-modified'].forEach(header => {
            if (appRes.headers[header]) res.set(header, appRes.headers[header])
          })
          res.status(appRes.statusCode)
          await pump(appRes, res)
          return resolve()
        }

        // all that follows is only applied to simple textual html content, we enrich it
        let buffer
        await pump(appRes, new Writable({
          write(chunk, encoding, callback) {
            buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk
            callback()
          },
        }))
        const document = parse5.parse(buffer.toString().replace(/%APPLICATION%/, JSON.stringify(req.application, null, 2)))
        const html = document.childNodes.find(c => c.tagName === 'html')
        if (!html) throw new Error(req.__('errors.brokenHTML'))
        const head = html.childNodes.find(c => c.tagName === 'head')
        const body = html.childNodes.find(c => c.tagName === 'body')
        if (!head || !body) throw new Error(req.__('errors.brokenHTML'))

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

        // make sure the referer is available when calling APIs and remote services from inside applications
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

        res.set('cache-control', 'private, max-age=0, must-revalidate')
        res.set('pragma', 'no-cache')
        res.send(parse5.serialize(document))
      } catch (err) {
        reject(err)
      }
    })

    cacheAppReq.on('error', err => reject(err))
    cacheAppReq.on('request', req => {
      req.on('error', err => reject(err))
      req.end()
    })
  })
}))
