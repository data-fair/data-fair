const config = require('config')
const { Nuxt, Builder } = require('nuxt')

const nuxtConfig = require('../nuxt.config.js')

module.exports = async () => {
  // Prepare nuxt for rendering and serving UI
  const nuxt = new Nuxt(nuxtConfig)
  if (config.nuxtBuild.active) {
    const build = new Builder(nuxt).build()
    if (config.nuxtBuild.blocking) await build
  }
  return (req, res, next) => {
    // re-apply the prefix that was removed by our reverse proxy in prod configs
    req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
    nuxt.render(req, res, next)
  }
}
