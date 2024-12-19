import config from 'config'
import asyncWrap from './misc/utils/async-handler.js'

export default async () => {
  const trackEmbed = asyncWrap(async (req, res, next) => {
    if (!req.url.startsWith('/embed/')) return next()
    const [resourceType, resourceId, embedView] = req.url.replace('/embed/', '').split(/[/?]/)
    if (resourceType === 'dataset') {
      const dataset = await req.app.get('db').collection('datasets').findOne({ id: resourceId }, { projection: { owner: 1, id: 1, title: 1 } })
      if (dataset) {
        const ownerHeader = { type: dataset.owner.type, id: dataset.owner.id }
        if (dataset.owner.department) ownerHeader.department = dataset.owner.department

        res.setHeader('x-resource', JSON.stringify({ type: 'embed', id: `${resourceType}-${resourceId}-${embedView}`, title: encodeURIComponent(`${dataset.title || dataset.id} / ${embedView}`) }))
        res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openEmbed', track: 'openApplication' }))
        res.setHeader('x-owner', JSON.stringify(ownerHeader))
      }
    }
    next()
  })
  if (config.proxyNuxt) {
    const { createProxyMiddleware } = await import('http-proxy-middleware')
    // in dev mode the nuxt dev server is already running, we re-expose it
    return {
      trackEmbed,
      render: createProxyMiddleware({
        target: 'http://localhost:3000/data-fair/'
        // pathRewrite: { '^/data-fair': '' }
      })
    }
  } else if (process.env.NODE_ENV === 'test') {
    // no UI during tests
    return { trackEmbed, render: (req, res, next) => next() }
  } else {
    const { Nuxt } = await import('nuxt-start')
    const nuxtConfig = await import('../nuxt.config.cjs')

    // Prepare nuxt for rendering and serving UI
    nuxtConfig.dev = false
    const nuxt = new Nuxt(nuxtConfig)
    return {
      trackEmbed,
      render: (req, res, next) => {
        // no buffering in the reverse proxy
        // disables caching that creates some unknown problem where sometimes some empty files are put in the cache
        res.setHeader('X-Accel-Buffering', 'no')

        // re-apply the prefix that was removed by our reverse proxy in prod configs
        req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
        nuxt.render(req, res, next)
      },
      instance: nuxt
    }
  }
}
