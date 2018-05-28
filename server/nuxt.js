const fs = require('fs')
const config = require('config')
const { Nuxt, Builder } = require('nuxt')

const nuxtConfig = require('../nuxt.config.js')
const alreadyBuilt = fs.existsSync('.nuxt/dist')

module.exports = async () => {
  // Prepare nuxt for rendering and serving UI
  const nuxt = new Nuxt(nuxtConfig)
  if (nuxtConfig.dev) new Builder(nuxt).build()
  else if (!alreadyBuilt && process.env.NODE_ENV !== 'test') await new Builder(nuxt).build()
  return (req, res, next) => {
    // re-apply the prefix that was removed by our reverse proxy in prod configs
    req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
    nuxt.render(req, res, next)
  }
}
