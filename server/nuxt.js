const config = require('config')

module.exports = async () => {
  const trackEmbed = (req, res, next) => {
    if (!req.url.startsWith('/embed/')) return next()
    const [resourceType, resourceId, embedView] = req.url.replace('/embed/', '').split(/[/?]/)
    res.setHeader('x-resource', JSON.stringify({ type: 'embed', id: `${resourceType}-${resourceId}-${embedView}`, title: encodeURIComponent(`${resourceId} / ${embedView}`) }))
    res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openEmbed', track: 'openApplication' }))
    next()
  }
  if (config.proxyNuxt) {
    // in dev mode the nuxt dev server is already running, we re-expose it
    return {
      trackEmbed,
      render: require('http-proxy-middleware').createProxyMiddleware({
        target: 'http://localhost:3000/data-fair/'
        // pathRewrite: { '^/data-fair': '' }
      })
    }
  } else if (process.env.NODE_ENV === 'test') {
    // no UI during tests
    return { trackEmbed, render: (req, res, next) => next() }
  } else {
    const { Nuxt } = require('nuxt-start')
    const nuxtConfig = require('../nuxt.config.js')

    // Prepare nuxt for rendering and serving UI
    nuxtConfig.dev = false
    const nuxt = new Nuxt(nuxtConfig)
    return {
      trackEmbed,
      render: async (req, res, next) => {
        // force buffering (necessary for caching) of this response in the reverse proxy
        res.setHeader('X-Accel-Buffering', 'yes')

        // re-apply the prefix that was removed by our reverse proxy in prod configs
        req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
        nuxt.render(req, res)
      },
      instance: nuxt
    }
  }
}
