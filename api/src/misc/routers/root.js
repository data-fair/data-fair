
import express from 'express'
import * as status from './status.js'
import apiDocs from '../../../contract/api-docs.js'
import projections from '../../../contract/projections.js'
import * as settingsUtils from '../utils/settings.js'
import * as ajv from '../utils/ajv.js'
import config from '#config'
import mongo from '#mongo'

const validateApi = ajv.compile('openapi-3.1')
const router = express.Router()

const remoteServices = config.remoteServices.map(s => ({ ...s }))

router.get('/ping', status.ping)

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs(req.user))
})

router.get('/vocabulary', async (req, res) => {
  res.json(await settingsUtils.getFullOwnerVocabulary(mongo.db, req.user && req.user.activeAccount, req.locale))
})

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

export default router
