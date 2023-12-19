const express = require('express')

const status = require('../routers/status')
const apiDocs = require('../../contract/api-docs')
const projections = require('../../contract/projections')
const asyncWrap = require('../utils/async-wrap')
const settingsUtils = require('../utils/settings')

const ajv = require('../utils/ajv')
const validateApi = ajv.compile('openapi-3.1')
const config = require('config')

const router = express.Router()

const remoteServices = config.remoteServices.map(s => ({ ...s }))

let info = { version: process.env.NODE_ENV }
try { info = require('../../BUILD.json') } catch (err) {}
router.get('/info', (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.send(info)
})

router.get('/status', (req, res, next) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  if (!req.user.adminMode) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  status.status(req, res, next)
})
router.get('/ping', status.ping)

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs(req.user))
})

router.get('/vocabulary', asyncWrap(async (req, res) => {
  res.send(await settingsUtils.getFullOwnerVocabulary(req.app.get('db'), req.user && req.user.activeAccount, req.locale))
}))

router.get('/projections', (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.json(projections.map(p => ({ title: p.title, code: p.code })))
})

// Check an Api documentation format
router.post('/_check-api', (req, res, next) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  validateApi(req.body)
  res.sendStatus(200)
})

router.get('/configurable-remote-services', (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.json(remoteServices)
})

router.get('/configurable-catalogs', (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.json(config.catalogs)
})

module.exports = router
