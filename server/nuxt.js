const fs = require('fs')
const config = require('config')
const { Nuxt, Builder } = require('nuxt')

const nuxtConfig = require('../nuxt.config.js')
const alreadyBuilt = fs.existsSync('.nuxt/dist')

module.exports = async () => {
  // Prepare nuxt for rendering and serving UI
  const nuxt = new Nuxt(nuxtConfig)
  if (nuxtConfig.dev) new Builder(nuxt).build()
  else if (!alreadyBuilt) await new Builder(nuxt).build()
  return (req, res, next) => {
    // Signin from the directory url
    if (req.query.id_token) {
      res.cookie('id_token', req.query.id_token, { maxAge: 30000 })
      delete req.query.id_token
      res.redirect(config.publicUrl + req.path)
    }

    // re-apply the prefix that was removed by our reverse proxy in prod configs
    req.url = (nuxtConfig.router.base + req.url).replace('//', '/')
    nuxt.render(req, res, next)
  }
}
