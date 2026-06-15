import express from 'express'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { reqAdminMode } from '@data-fair/lib-express'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import {
  getStatus,
  findDatasetsErrors,
  findDatasetsEsWarnings,
  findApplicationsErrors,
  findApplicationsDraftErrors,
  findOwners,
  findBaseApplications
} from './service.ts'
import { getElasticsearchDiagnose } from './elasticsearch-diagnose-service.ts'

const router = express.Router()
export default router

// All routes in the router are only for the super admins of the service
router.use(async (req, res, next) => {
  reqAdminMode(req)
  next()
})

router.use(cacheHeaders.noCache)

let info: any = { version: process.env.NODE_ENV }
router.get('/info', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    info = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../BUILD.json'), 'utf8'))
  }
  res.json(info)
})

router.get('/status', async (req, res) => {
  res.send(await getStatus(req))
})

router.get('/datasets-errors', async (req, res) => {
  res.send(await findDatasetsErrors(req.query))
})

router.get('/datasets-es-warnings', async (req, res) => {
  res.send(await findDatasetsEsWarnings(req.query))
})

router.get('/elasticsearch/diagnose', async (req, res, next) => {
  try {
    res.send(await getElasticsearchDiagnose())
  } catch (err) {
    next(err)
  }
})

router.get('/applications-errors', async (req, res) => {
  res.send(await findApplicationsErrors(req.query))
})

router.get('/applications-draft-errors', async (req, res) => {
  res.send(await findApplicationsDraftErrors(req.query))
})

router.get('/owners', async (req, res) => {
  res.send(await findOwners(req.query))
})

router.get('/base-applications', async (req, res) => {
  res.send(await findBaseApplications(req.query, req.publicBaseUrl))
})
