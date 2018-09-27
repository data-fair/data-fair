const express = require('express')
const requestProxy = require('express-request-proxy')
const config = require('config')
const replaceStream = require('replacestream')
const url = require('url')
const { Transform } = require('stream')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const applicationAPIDocs = require('../../contract/application-api-docs')
const permissions = require('../utils/permissions')
const router = module.exports = express.Router()

const setResource = asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications').findOne({
    id: req.params.applicationId
  }, {
    fields: { _id: 0 }
  })
  if (!req.application) return res.status(404).send('Application configuration not found')
  findUtils.setResourceLinks(req.application, 'application')
  req.resourceApiDoc = applicationAPIDocs(req.application)
  next()
})

// Proxy for applications
router.all('/:applicationId*', setResource, permissions.middleware('readDescription', 'read'), asyncWrap(async(req, res, next) => {
  delete req.application.permissions

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

  // Prevent infinite redirect loops
  // it seems that express routing does not catch a single '/' after /:applicationId*
  if (req.params['0'] === '') {
    req.params['0'] = '/'
  }
  const originalUrl = url.parse(req.originalUrl)
  // Trailing / are removed by express... we want them or else we enter infinite redirect loops with gh-pages
  if (originalUrl.pathname[originalUrl.pathname.length - 1] === '/' && req.params['0'][req.params['0'].length - 1] !== '/') {
    req.params['0'] += '/'
  }

  // Transform HTML content from response to inject params.
  // Usefull for client-side only applications that cannot read the headers.
  options.transforms = [{
    name: 'cache-manager',
    match: (resp) => {
      // fix cache. Remove etag,  calculate last-modified, etc.
      delete resp.headers.expires
      delete resp.headers.etag
      resp.headers['cache-control'] = 'private'
      const lastModified = new Date(resp.headers['last-modified'] || req.application.updatedAt)
      if (resp.statusCode !== 200) return false
      if (ifModifiedSince >= updatedAt && ifModifiedSince >= lastModified) {
        resp.statusCode = 304
        return true
      }
      if (updatedAt > lastModified) {
        resp.headers['last-modified'] = updatedAt.toUTCString()
      } else {
        resp.headers['last-modified'] = lastModified.toUTCString()
      }
      return false
    },
    // Empty the stream if the content was not modified
    transform: new Transform({ _transform(chunk, encoding, cb) { cb() } })
  }, {
    name: 'config-injector',
    match: (resp) => {
      // No permanent redirects, they are a pain for developping, debugging, etc.
      if (resp.statusCode === 301) resp.statusCode = 302

      // Fix redirects
      if (resp.statusCode === 302) {
        resp.headers.location = resp.headers.location.replace(cleanApplicationUrl, req.application.exposedUrl)
        resp.headers.location = resp.headers.location.replace(cleanApplicationUrl.replace('https://', 'http://'), req.application.exposedUrl)
      }

      // Do not attempt to transform errors or redirects
      if (resp.statusCode !== 200) return false

      // Do not transform compressed content
      if (resp.headers['content-encoding'] && resp.headers['content-encoding'] !== 'identity') {
        console.error(`A proxied application (${req.originalUrl}) sent compressed data (${resp.headers['content-encoding']})`)
        return false
      }

      return !resp.headers['content-type'] || (resp.headers['content-type'].indexOf('text/html') === 0)
    },
    transform: () => replaceStream('%APPLICATION%', JSON.stringify(req.application))
  }]
  requestProxy(options)(req, res, next)
}))
