const express = require('express')
const requestProxy = require('express-request-proxy')
const config = require('config')
const auth = require('./auth')
const asyncWrap = require('./utils/async-wrap')

const router = module.exports = express.Router()

// Proxy for applications
router.get('/:applicationId*', auth.optionalJwtMiddleware, asyncWrap(async(req, res, next) => {
  const application = await req.app.get('db').collection('applications').findOne({
    id: req.params.applicationId
  })
  if (!application) return res.status(404).send('No application configured for this id')
  const options = {
    url: application.url,
    headers: {
      'X-Exposed-Url': config.publicUrl + '/app/' + req.params.applicationId,
      'X-Application-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId,
      'X-Directory-Url': config.directoryUrl,
      'X-API-Url': config.publicUrl + '/api/v1',
      // This header is deprecated, use X-Application-Url instead and concatenate /config to it
      'X-Config-Url': config.publicUrl + '/api/v1/applications/' + req.params.applicationId + '/config'
    }
  }
  requestProxy(options)(req, res, next)
}))
