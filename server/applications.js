const express = require('express')
const requestProxy = require('express-request-proxy')
const config = require('config')

const router = module.exports = express.Router()

// Proxy for applications
router.get('/:applicationConfigId*', async function(req, res, next) {
  try {
    const applicationConfig = await req.app.get('db').collection('application-configs').findOne({
      id: req.params.applicationConfigId
    })
    if (!applicationConfig) return res.status(404).send('No application configured for this id')
    const options = {
      url: applicationConfig.url,
      headers: {
        'X-Exposed-Url': config.publicUrl + '/applications/' + req.params.applicationConfigId,
        'X-Config-Url': config.publicUrl + '/api/v1/application-configs/' + req.params.applicationConfigId + '/config',
        'X-Directory-Url': config.directoryUrl,
        'X-API-Url': config.publicUrl + '/api/v1'
      }
    }
    requestProxy(options)(req, res, next)
  } catch (err) {
    next(err)
  }
})
