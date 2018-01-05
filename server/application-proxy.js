const express = require('express')
const requestProxy = require('express-request-proxy')
const config = require('config')
const auth = require('./auth')

const router = module.exports = express.Router()

// Proxy for applications
router.get('/:applicationId*', auth.optionalJwtMiddleware, async function(req, res, next) {
  try {
    const application = await req.app.get('db').collection('applications').findOne({
      id: req.params.applicationId
    })
    if (!application) return res.status(404).send('No application configured for this id')
    const options = {
      url: application.url,
      headers: {
        'X-Exposed-Url': config.publicUrl + '/app/' + req.params.applicationId,
        'X-Config-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId + '/config',
        'X-Directory-Url': config.directoryUrl,
        'X-API-Url': config.publicUrl + '/api/v1'
      }
    }
    requestProxy(options)(req, res, next)
  } catch (err) {
    next(err)
  }
})
