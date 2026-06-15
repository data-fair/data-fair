import express from 'express'
import config from '#config'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import * as parse5 from 'parse5'
import pump from '../misc/utils/pipe.ts'
import CacheableLookup from 'cacheable-lookup'
import * as permissions from '../misc/utils/permissions.ts'
import * as serviceWorkers from '../misc/utils/service-workers.js'
import { refreshConfigDatasetsRefs } from './utils.ts'
import { buildManifest, buildLoginHtml } from './operations.ts'
import { setProxyResource, reqApplication, reqMatchingApplicationKey } from './middlewares.ts'
import { getManifestBaseApp, getProxyBaseAppAndLimits, fetchHTML, getHtmlCache } from './proxy-service.ts'
import Debug from 'debug'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSession, reqSiteUrl, reqUserAuthenticated } from '@data-fair/lib-express'
import type { Application, Request } from '#types'

// the proxy enriches the loaded application with request-time fields that are not part of the
// Application JSON schema (exposedUrl from setResourceLinks, plus apiUrl/captureUrl/wsUrl/applicationKey
// injected for the embedded app). Precise cast surface, not `any` — mirrors utils.ts clean enrichments.
type ProxyApplication = Application & {
  exposedUrl: string
  apiUrl?: string
  captureUrl?: string
  wsUrl?: string
  applicationKey?: string
}

const debugIframeRedirect = Debug('iframe-redirect')

const router = express.Router()
export default router

const cacheableLookup = new CacheableLookup()

const loginHtml = fs.readFileSync(path.resolve(import.meta.dirname, './resources/login.html'), 'utf8')

const brandEmbed = config.brand.embed && parse5.parseFragment(config.brand.embed)

router.get('/:applicationId/manifest.json', setProxyResource, async (req, res) => {
  if (!permissions.can('applications', reqApplication(req), 'readConfig', reqSession(req)) && !reqMatchingApplicationKey(req)) {
    return res.status(403).type('text/plain').send()
  }
  const baseApp = await getManifestBaseApp(reqApplication(req).url)
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  res.setHeader('Content-Type', 'application/manifest+json')
  // exposedUrl is a request-time enrichment added by setResourceLinks (same gap as utils.ts clean); precise cast, not `any`
  res.send(buildManifest(reqApplication(req) as ProxyApplication, baseApp, (req as Request).publicBaseUrl))
})

// Login is a special small UI page on /app/appId/login
// this is so that we expose a minimalist password based auth in the scope of the current application
// prevents opening a browser if the app is installed standalone
router.get('/:applicationId/login', setProxyResource, (req, res) => {
  if (typeof req.params.applicationId !== 'string') throw httpError(400, 'invalid path parameters')
  res.setHeader('Content-Type', 'text/html')
  res.send(buildLoginHtml(loginHtml, {
    siteUrl: reqSiteUrl(req),
    application: reqApplication(req),
    applicationId: req.params.applicationId,
    error: req.query.error as string | undefined
  }))
})

// for debug only
router.get('/_htmlcache', (req, res, next) => {
  const user = reqUserAuthenticated(req)
  if (!user.adminMode) return res.status(403)
  return res.send(getHtmlCache())
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

let minifiedIframeRedirectSrc: string
router.all(['/:applicationId/*extraPath', '/:applicationId'], setProxyResource, async (req, res, next) => {
  const application = reqApplication(req) as ProxyApplication

  if (!permissions.can('applications', application, 'readConfig', reqSession(req)) && !reqMatchingApplicationKey(req)) {
    return res.redirect(`${(req as Request).publicBaseUrl}/app/${req.params.applicationId}/login`)
  }

  delete application.permissions
  application.apiUrl = (req as Request).publicBaseUrl + '/api/v1'
  // TODO: captureUrl should be on same domain too ?
  application.captureUrl = config.captureUrl
  application.wsUrl = (req as Request).publicWsBaseUrl
  const matchingKey = reqMatchingApplicationKey(req)
  if (matchingKey) application.applicationKey = matchingKey

  const draft = req.query.draft === 'true'
  if (draft) {
    application.configuration = application.configurationDraft || application.configuration
  }
  delete application.configurationDraft
  const applicationUrl = (req.query.draft === 'true' ? (application.urlDraft || application.url) : application.url)
  // Remove trailing slash for more homogeneous rules afterward
  const cleanApplicationUrl = applicationUrl.replace(/\/$/, '')

  // check that the user can access the base appli
  const accessFilter = [
    { public: true },
    { privateAccess: { $elemMatch: { type: application.owner.type, id: application.owner.id } } }
  ]

  await refreshConfigDatasetsRefs(req as Request, application, draft)

  const [limits, baseApp] = await getProxyBaseAppAndLimits(application, applicationUrl, accessFilter)
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))

  // merge incoming an target URL elements
  const incomingUrl = new URL('http://host' + req.url)
  const targetUrl = new URL(cleanApplicationUrl.replace(config.applicationsPrivateMapping[0], config.applicationsPrivateMapping[1]))
  const extraPathParts = req.params.extraPath ? [...req.params.extraPath] : []
  if (!req.params.extraPath || incomingUrl.pathname.endsWith('/')) extraPathParts.push('index.html')
  targetUrl.pathname = path.join(targetUrl.pathname, ...extraPathParts)
  targetUrl.search = incomingUrl.searchParams.toString()

  if (extraPathParts.length !== 1 || extraPathParts[0] !== 'index.html') {
    // TODO: check the logs in production, if this line never appears then we can cleanup the code
    console.warn('serving anything else than /index.html from application-proxy is deprecated', targetUrl.href)
    await deprecatedProxy(cleanApplicationUrl, targetUrl, req, res)
    return
  }
  res.setHeader('x-resource', JSON.stringify({ type: permissions.reqResourceType(req), id: permissions.reqResource(req).id, title: encodeURIComponent(permissions.reqResource(req).title) }))
  res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openApplication', track: 'openApplication' }))
  const ownerHeader: { type: string, id: string, department?: string } = { type: permissions.reqResource(req).owner.type, id: permissions.reqResource(req).owner.id }
  if (permissions.reqResource(req).owner.department) ownerHeader.department = permissions.reqResource(req).owner.department
  res.setHeader('x-owner', JSON.stringify(ownerHeader))
  const rawHtml = await fetchHTML(cleanApplicationUrl, targetUrl)

  const document = parse5.parse(rawHtml.replace(/%APPLICATION%/, JSON.stringify(application)))
  const html = document.childNodes.find((c: any) => c.tagName === 'html') as any
  if (!html) throw new Error(req.__('errors.brokenHTML'))
  const head = html.childNodes.find((c: any) => c.tagName === 'head')
  const body = html.childNodes.find((c: any) => c.tagName === 'body')
  if (!head || !body) throw new Error(req.__('errors.brokenHTML'))

  const pushHeadNode = (node: any, text?: string, prepend = false) => {
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
  const manifestUrl = new URL(application.exposedUrl).pathname + '/manifest.json'
  const manifest = head.childNodes.find((c: any) => c.attrs && c.attrs.find((a: any) => a.name === 'rel' && a.value === 'manifest'))
  if (manifest) {
    manifest.attrs.find((a: any) => a.name === 'href').value = manifestUrl
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
    const refererUrl = new URL(referer as string)
    const refererDomain = refererUrl.hostname
    const iframeRedirectUrl = new URL(`${(req as Request).publicBaseUrl}${req.originalUrl}`)
    if (refererDomain !== 'localhost' && refererDomain !== iframeRedirectUrl.hostname && refererDomain !== iframeRedirectUrl.searchParams.get('referer')) {
      iframeRedirectUrl.searchParams.set('referer', refererDomain)
      iframeRedirect = iframeRedirectUrl.href
      const { minify } = await import('terser')
      minifiedIframeRedirectSrc = minifiedIframeRedirectSrc || (await minify(iframeRedirectSrc, { toplevel: true, compress: true, mangle: true })).code as string
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
          { name: 'src', value: 'https://cdn.jsdelivr.net/npm/@data-fair/frame@0.18/dist/v-iframe-compat/d-frame-content.min.js' }
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

const deprecatedProxy = async (cleanApplicationUrl: string, targetUrl: URL, req: express.Request, res: express.Response) => {
  // cacheable-lookup's lookup signature is structurally compatible at runtime but its overloads
  // don't unify with Node's LookupFunction type; cast the options to RequestOptions to bridge it
  const options: https.RequestOptions = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    protocol: targetUrl.protocol,
    path: targetUrl.pathname + targetUrl.hash + targetUrl.search,
    timeout: config.remoteTimeout,
    lookup: cacheableLookup.lookup as unknown as https.RequestOptions['lookup']
  }
  await new Promise<void>((resolve, reject) => {
    const cacheAppReq = (targetUrl.protocol === 'http:' ? http.request : https.request)(options, async (appRes) => {
      try {
        if (appRes.statusCode === 301 || appRes.statusCode === 302) {
          const exposedUrl = (reqApplication(req) as ProxyApplication).exposedUrl
          const location = appRes.headers.location!
            .replace(cleanApplicationUrl, exposedUrl)
            .replace(cleanApplicationUrl.replace('https://', 'http://'), exposedUrl)
            .replace(cleanApplicationUrl.replace('https:', ''), exposedUrl) // for gitlab pages
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
        res.status(appRes.statusCode!)
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
