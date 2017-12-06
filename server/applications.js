const express = require('express')
const requestProxy = require('express-request-proxy')

const router = module.exports = express.Router()

// Get the list of application-configs
router.get('/:applicationConfigId', async function(req, res, next) {
  try {
    const applicationConfig = await req.app.get('db').collection('application-configs').findOne({
      id: req.params.applicationConfigId
    })
    if (!applicationConfig) return res.status(404).send('No application configured for this id')
    const options = {
      url: applicationConfig.url
    }
    requestProxy(options)(req, res, next)
  } catch (err) {
    next(err)
  }
})
