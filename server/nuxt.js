// const path = require('path')
const fs = require('fs')

const { Nuxt, Builder } = require('nuxt')

const nuxtConfig = require('../nuxt.config.js')

module.exports = async () => {
  if (process.env.NODE_ENV === 'development') {
    // in dev mode the nuxt dev server is already running, we re-expose it
    return require('http-proxy-middleware')({ target: 'http://localhost:3000' })
  } else {
    // Prepare nuxt for rendering and serving UI
    const nuxt = new Nuxt(nuxtConfig)

    if (fs.existsSync('.nuxt')) {
      console.log('Nuxt build was already done.')
    } else {
      await new Builder(nuxt).build()
    }

    return (req, res, next) => {
      // re-apply the prefix that was removed by our reverse proxy in prod configs
      req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
      nuxt.render(req, res, next)
    }
  }
}
