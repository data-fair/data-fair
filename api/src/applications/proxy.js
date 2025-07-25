import express from 'express'
import config from '#config'
import mongo from '#mongo'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import escapeHtml from 'escape-html'
import axios from '../misc/utils/axios.js'
import * as parse5 from 'parse5'
import pump from '../misc/utils/pipe.ts'
import CacheableLookup from 'cacheable-lookup'
import * as findUtils from '../misc/utils/find.js'
import * as permissions from '../misc/utils/permissions.ts'
import * as serviceWorkers from '../misc/utils/service-workers.js'
import { refreshConfigDatasetsRefs } from './utils.js'
import Debug from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import { reqSession, reqUserAuthenticated } from '@data-fair/lib-express'

const debugIframeRedirect = Debug('iframe-redirect')

const router = express.Router()
export default router

const cacheableLookup = new CacheableLookup()

const loginHtml = fs.readFileSync(path.resolve(import.meta.dirname, './resources/login.html'), 'utf8')

const brandEmbed = config.brand.embed && parse5.parseFragment(config.brand.embed)

const setResource = async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl

  const tolerateStale = !!publicationSite
  // protected application can be given either as /applicationKey:applicationId or /applicationId?key=applicationKey
  let application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params, 'application', null, tolerateStale)
  let applicationKeyId = req.query.key
  if (!application && !applicationKeyId) {
    const keys = req.params.applicationId.split(':')
    applicationKeyId = keys[0]
    const applicationIdCandidate = req.params.applicationId.replace(keys[0] + ':', '')
    application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params, 'application', applicationIdCandidate, tolerateStale)
  }
  if (!application) return res.status(404).send(req.__('errors.missingApp'))
  const ownerFilter = {
    'owner.type': application.owner.type,
    'owner.id': application.owner.id,
    'owner.department': application.owner.department ? application.owner.department : { $exists: false }
  }
  if (applicationKeyId) {
    const applicationKey = await mongo.db.collection('applications-keys')
      .findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
    if (applicationKey) {
      if (applicationKey._id === application.id) {
        // @ts-ignore
        req.matchingApplicationKey = true
      } else {
        // ths application key can be matched to a parent application key (case of dashboards, etc)
        const isParentApplicationKey = await mongo.db.collection('applications')
          .count({ id: applicationKey._id, 'configuration.applications.id': application.id, ...ownerFilter })
        if (isParentApplicationKey) {
          // @ts-ignore
          req.matchingApplicationKey = true
        }
      }
    }
  }
  findUtils.setResourceLinks(application, 'application', publicBaseUrl, null, encodeURIComponent(req.params.applicationId))

  // @ts-ignore
  req.resourceType = 'applications'
  // @ts-ignore
  req.application = req.resource = application
  next()
}

router.get('/:applicationId/manifest.json', setResource, async (req, res) => {
  if (!permissions.can('applications', req.application, 'readConfig', reqSession(req)) && !req.matchingApplicationKey) {
    return res.status(403).type('text/plain').send()
  }
  const baseApp = await mongo.db.collection('base-applications').findOne({ url: req.application.url }, { projection: { id: 1, meta: 1 } })
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
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
      const iconUrl = new URL(req.publicBaseUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/icon')
      const [width, height] = sizes.split('x')
      iconUrl.searchParams.set('width', width)
      iconUrl.searchParams.set('height', height)
      return {
        sizes,
        type: 'image/png',
        src: iconUrl.href
      }
    })
  })
})

// Login is a special small UI page on /app/appId/login
// this is so that we expose a minimalist password based auth in the scope of the current application
// prevents opening a browser if the app is installed standalone
router.get('/:applicationId/login', setResource, (req, res) => {
  res.setHeader('Content-Type', 'text/html')
  const authUrl = new URL(`${req.directoryUrl}/api/auth/password`)
  authUrl.searchParams.set('redirect', `${req.publicBaseUrl}/app/${req.params.applicationId}`)
  if (req.application.owner.type === 'organization') {
    authUrl.searchParams.set('org', req.application.owner.id)
  }
  const logoUrl = new URL(`${req.directoryUrl}/api/avatars/${req.application.owner.type}/${req.application.owner.id}/avatar.png`)
  res.send(loginHtml
    .replace('{ERROR}', req.query.error ? `<p style="color:red">${escapeHtml(req.query.error)}</p>` : '')
    .replace('{AUTH_ROUTE}', authUrl.href)
    .replace('{LOGO}', logoUrl.href)
  )
})

const htmlCache = {}
const fetchHTML = async (cleanApplicationUrl, targetUrl) => {
  const cacheEntry = htmlCache[cleanApplicationUrl]
  try {
    // search params should not be interpreted by the static application server
    delete targetUrl.search
    const headers = {}
    if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag
    if (cacheEntry?.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified
    const res = await axios.get(targetUrl.href, {
      headers,
      validateStatus: function (status) {
        return status === 200 || status === 304
      }
    })
    if (res.status === 304) {
      return cacheEntry.content
    } else {
      htmlCache[cleanApplicationUrl] = {
        content: res.data,
        etag: res.headers.etag,
        lastModified: res.headers['last-modified'],
        fetchedAt: new Date()
      }
      return res.data
    }
  } catch (err) {
    internalError('app-fetch', err)
    if (cacheEntry) return cacheEntry.content
    throw err
    // in case of failure, serve from simple cache
  }
}
// for debug only
router.get('/_htmlcache', (req, res, next) => {
  const user = reqUserAuthenticated(req)
  if (!user.adminMode) return res.status(403)
  return res.send(htmlCache)
})

// Proxy for applications
const iframeRedirectSrc = `
function inIframe () {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}
if (inIframe()) {
  ${debugIframeRedirect.enabled ? 'console.log("redirect iframe to include referer", window.location.href, "__IFRAME_REDIRECT__")' : ''}
  if (window.history && window.history.replaceState) window.history.replaceState(null, '', "__IFRAME_REDIRECT__");
  else if (window.location.replace) window.location.replace("__IFRAME_REDIRECT__");
  else window.location.href = "__IFRAME_REDIRECT__";
}
`

/** @type {string} */
let minifiedIframeRedirectSrc
router.all(['/:applicationId/*extraPath', '/:applicationId'], setResource, async (req, res, next) => {
  const db = mongo.db

  if (!permissions.can('applications', req.application, 'readConfig', reqSession(req)) && !req.matchingApplicationKey) {
    return res.redirect(`${req.publicBaseUrl}/app/${req.params.applicationId}/login`)
  }

  delete req.application.permissions
  req.application.apiUrl = req.publicBaseUrl + '/api/v1'
  // TODO: captureUrl should be on same domain too ?
  req.application.captureUrl = config.captureUrl
  req.application.wsUrl = req.publicWsBaseUrl
  const draft = req.query.draft === 'true'
  if (draft) {
    req.application.configuration = req.application.configurationDraft || req.application.configuration
  }
  delete req.application.configurationDraft
  const applicationUrl = (req.query.draft === 'true' ? (req.application.urlDraft || req.application.url) : req.application.url)
  // Remove trailing slash for more homogeneous rules afterward
  const cleanApplicationUrl = applicationUrl.replace(/\/$/, '')

  // check that the user can access the base appli
  const accessFilter = [
    { public: true },
    { privateAccess: { $elemMatch: { type: req.application.owner.type, id: req.application.owner.id } } }
  ]

  await refreshConfigDatasetsRefs(req, req.application, draft)

  const [limits, baseApp] = await Promise.all([
    db.collection('limits').findOne({ type: req.application.owner.type, id: req.application.owner.id }),
    db.collection('base-applications').findOne({ url: applicationUrl, $or: accessFilter }, { projection: { id: 1, meta: 1 } })
  ])
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))

  // merge incoming an target URL elements
  const incomingUrl = new URL('http://host' + req.url)
  const targetUrl = new URL(cleanApplicationUrl.replace(config.applicationsPrivateMapping[0], config.applicationsPrivateMapping[1]))
  const extraPathParts = req.params.extraPath ? [...req.params.extraPath] : []
  if (!req.params.extraPath || incomingUrl.pathname.endsWith('/')) extraPathParts.push('index.html')
  targetUrl.pathname = path.join(targetUrl.pathname, ...extraPathParts)
  targetUrl.search = incomingUrl.searchParams

  if (extraPathParts.length !== 1 || extraPathParts[0] !== 'index.html') {
    // TODO: check the logs in production, if this line never appears then we can cleanup the code
    console.warn('serving anything else than /index.html from application-proxy is deprecated', targetUrl.href)
    await deprecatedProxy(cleanApplicationUrl, targetUrl, req, res)
    return
  }
  res.setHeader('x-resource', JSON.stringify({ type: req.resourceType, id: req.resource.id, title: encodeURIComponent(req.resource.title) }))
  res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openApplication', track: 'openApplication' }))
  const ownerHeader = { type: req.resource.owner.type, id: req.resource.owner.id }
  if (req.resource.owner.department) ownerHeader.department = req.resource.owner.department
  res.setHeader('x-owner', JSON.stringify(ownerHeader))
  const rawHtml = await fetchHTML(cleanApplicationUrl, targetUrl)

  const document = parse5.parse(rawHtml.replace(/%APPLICATION%/, JSON.stringify(req.application)))
  const html = document.childNodes.find(c => c.tagName === 'html')
  if (!html) throw new Error(req.__('errors.brokenHTML'))
  const head = html.childNodes.find(c => c.tagName === 'head')
  const body = html.childNodes.find(c => c.tagName === 'body')
  if (!head || !body) throw new Error(req.__('errors.brokenHTML'))

  const pushHeadNode = (node, text, prepend = false) => {
    node.parentNode = head
    node.namespaceURI = 'http://www.w3.org/1999/xhtml'
    if (text) {
      const textNode = {
        nodeName: '#text',
        value: text,
        parentNode: node
      }
      node.childNodes = [textNode]
    }
    if (prepend) head.childNodes.unshift(node)
    else head.childNodes.push(node)
  }

  // Data-fair generates a manifest per app
  const manifestUrl = new URL(req.application.exposedUrl).pathname + '/manifest.json'
  const manifest = head.childNodes.find(c => c.attrs && c.attrs.find(a => a.name === 'rel' && a.value === 'manifest'))
  if (manifest) {
    manifest.attrs.find(a => a.name === 'href').value = manifestUrl
  } else {
    pushHeadNode({
      nodeName: 'link',
      tagName: 'link',
      attrs: [
        { name: 'rel', value: 'manifest' },
        { name: 'crossorigin', value: 'use-credentials' },
        { name: 'href', value: manifestUrl }
      ]
    })
  }

  // make sure the referer is available when calling APIs and remote services from inside applications
  pushHeadNode({
    nodeName: 'meta',
    tagName: 'meta',
    attrs: [
      { name: 'name', value: 'referrer' },
      { name: 'content', value: 'same-origin' }
    ]
  })

  // Data-fair manages tracking of original referer
  const referer = req.headers.referer || req.headers.referrer
  let iframeRedirect
  if (referer) {
    const refererUrl = new URL(referer)
    const refererDomain = refererUrl.hostname
    const iframeRedirectUrl = new URL(`${req.publicBaseUrl}${req.originalUrl}`)
    if (refererDomain !== 'localhost' && refererDomain !== iframeRedirectUrl.hostname && refererDomain !== iframeRedirectUrl.searchParams.get('referer')) {
      iframeRedirectUrl.searchParams.set('referer', refererDomain)
      iframeRedirect = iframeRedirectUrl.href
      const { minify } = await import('terser')
      minifiedIframeRedirectSrc = minifiedIframeRedirectSrc || (await minify(iframeRedirectSrc, { toplevel: true, compress: true, mangle: true })).code
      const scriptNode = {
        nodeName: 'script',
        tagName: 'script',
        attrs: [{ name: 'type', value: 'text/javascript' }]
      }
      if (req.query['iframe-redirect'] === 'false' || refererUrl.searchParams.get('iframe-redirect') === 'false') {
        debugIframeRedirect('manually disabled iframe redirect', iframeRedirect)
      } else if (req.query['iframe-redirect'] === 'prepend' || refererUrl.searchParams.get('iframe-redirect') === 'prepend') {
        debugIframeRedirect('force prepending iframe redirect script', iframeRedirect)
        pushHeadNode(scriptNode, minifiedIframeRedirectSrc.replaceAll('__IFRAME_REDIRECT__', iframeRedirect), true)
      } else {
        debugIframeRedirect('iframe redirect to include referer domain', iframeRedirect)
        pushHeadNode(scriptNode, minifiedIframeRedirectSrc.replaceAll('__IFRAME_REDIRECT__', iframeRedirect))
      }
    }
  }

  // Data-fair also generates a basic service-workers configuration per app
  pushHeadNode({
    nodeName: 'script',
    tagName: 'script',
    attrs: [{ name: 'type', value: 'text/javascript' }]
  }, await serviceWorkers.register())

  if (req.query['d-frame'] === 'true') {
    if (baseApp.meta['df:sync-state'] === 'true' || baseApp.meta['df:overflow'] === 'true') {
      body.childNodes.push({
        nodeName: 'script',
        tagName: 'script',
        attrs: [
          { name: 'type', value: 'text/javascript' },
          { name: 'src', value: 'https://cdn.jsdelivr.net/npm/@data-fair/frame@0.7/dist/v-iframe-compat/d-frame-content.min.js' }
        ],
        parentNode: body
      })
    }
  } else {
    // add @koumoul/v-iframe/content-window.min.js to support state sync with portals, etc.
    if (baseApp.meta['df:sync-state'] === 'true') {
      body.childNodes.push({
        nodeName: 'script',
        tagName: 'script',
        attrs: [
          { name: 'type', value: 'text/javascript' },
          { name: 'src', value: 'https://cdn.jsdelivr.net/npm/@koumoul/v-iframe@1/content-window.min.js' }
        ],
        parentNode: body
      })
    }

    // add iframe-resizer/js/iframeResizer.contentWindow.min.js to support dynamic resizing of the iframe in portals, etc
    if (baseApp.meta['df:overflow'] === 'true') {
      body.childNodes.push({
        nodeName: 'script',
        tagName: 'script',
        attrs: [
          { name: 'type', value: 'text/javascript' },
          { name: 'src', value: 'https://cdn.jsdelivr.net/npm/iframe-resizer@4/js/iframeResizer.contentWindow.min.js' }
        ]
      })
    }
  }

  // add a brand logo somewhere over the applications
  const hideBrand = (limits && limits.hide_brand && limits.hide_brand.limit) || config.defaultLimits.hideBrand
  if (brandEmbed && !hideBrand) {
    for (const childNode of brandEmbed.childNodes) {
      body.childNodes.push(childNode)
    }
  }

  res.set('cache-control', 'private, max-age=0, must-revalidate')
  res.set('pragma', 'no-cache')
  res.send(parse5.serialize(document))
})

const deprecatedProxy = async (cleanApplicationUrl, targetUrl, req, res) => {
  const options = {
    host: targetUrl.host,
    port: targetUrl.port,
    protocol: targetUrl.protocol,
    path: targetUrl.pathname + targetUrl.hash + targetUrl.search,
    timeout: config.remoteTimeout,
    lookup: cacheableLookup.lookup
  }
  await new Promise((resolve, reject) => {
    const cacheAppReq = (targetUrl.protocol === 'http:' ? http.request : https.request)(options, async (appRes) => {
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

        for (const header of ['content-type', 'content-length', 'pragma', 'cache-control', 'expires', 'last-modified']) {
          if (appRes.headers[header]) res.set(header, appRes.headers[header])
        }
        res.status(appRes.statusCode)
        await pump(appRes, res)
        return resolve()
      } catch (err) {
        reject(err)
      }
    })
    cacheAppReq.on('error', err => {
      reject(err)
    })
    cacheAppReq.on('error', err => reject(err))
    cacheAppReq.end()
  })
}
