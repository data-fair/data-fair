import express from 'express'
import * as status from './status.js'
import apiDocs from '../../../contract/api-docs.ts'
import projections from '../../../contract/projections.js'
import * as settingsUtils from '../utils/settings.ts'
import * as ajv from '../utils/ajv.ts'
import config from '#config'
import { reqSession, reqSessionAuthenticated } from '@data-fair/lib-express'

const validateApi = ajv.compile('openapi-3.1')
const router = express.Router()

const remoteServices = config.remoteServices.map((s: any) => ({ ...s }))

router.get('/ping', status.ping)

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs())
})

router.get('/vocabulary', async (req, res) => {
  res.json(await settingsUtils.getFullOwnerVocabulary(reqSession(req).account, req.getLocale() as 'en' | 'fr'))
})

router.get('/projections', (req, res) => {
  reqSessionAuthenticated(req)
  res.json(projections.map(p => ({ title: p.title, code: p.code })))
})

// Check an Api documentation format
router.post('/_check-api', (req, res, next) => {
  reqSessionAuthenticated(req)
  validateApi(req.body)
  res.sendStatus(200)
})

router.get('/configurable-remote-services', (req, res) => {
  reqSessionAuthenticated(req)
  res.json(remoteServices)
})

router.get('/configurable-catalogs', (req, res) => {
  reqSessionAuthenticated(req)
  res.json(config.catalogs)
})

export default router
