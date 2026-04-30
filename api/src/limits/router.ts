import express from 'express'
import config from '#config'
import mongo from '#mongo'
import * as ajv from '../misc/utils/ajv.ts'
import { reqAdminMode, reqUserAuthenticated } from '@data-fair/lib-express'
import type { Limits, Request } from '#types'
import type { Response, NextFunction, RequestHandler } from 'express'
import type { Filter } from 'mongodb'
import { getLimits } from './service.ts'

const limitTypeSchema = { type: 'object', properties: { limit: { type: 'number' }, consumption: { type: 'number' } } }
const schema = {
  type: 'object',
  required: ['id', 'type', 'lastUpdate'],
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    lastUpdate: { type: 'string', format: 'date-time' },
    defaults: { type: 'boolean', title: 'these limits were defined using default values only, not specifically defined' },
    store_bytes: limitTypeSchema,
    indexed_bytes: limitTypeSchema,
    nb_datasets: limitTypeSchema,
    hide_brand: limitTypeSchema
  }
}
const validate = ajv.compile(schema)

export const router = express.Router()

const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.key === config.secretKeys.limits) return next()
  reqAdminMode(req)
  next()
}

const isAccountMember = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.key === config.secretKeys.limits) return next()
  const user = reqUserAuthenticated(req)
  if (user.adminMode) return next()
  if (!['organization', 'user'].includes(req.params.type)) {
    return res.status(400).type('text/plain').send('Wrong consumer type')
  }
  if (req.params.type === 'user') {
    if (user.id !== req.params.id) {
      return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    }
  }
  if (req.params.type === 'organization') {
    const org = user.organizations.find(o => o.id === req.params.id)
    if (!org) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  }
  next()
}

// Endpoint for customers service to create/update limits
router.post('/:type/:id', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const db = mongo.db
  req.body.type = req.params.type
  req.body.id = req.params.id
  validate(req.body)
  const existingLimits = await db.collection('limits').findOne({ type: req.params.type, id: req.params.id })
  if (existingLimits) {
    for (const key of ['store_bytes', 'indexed_bytes', 'nb_datasets']) {
      if (req.body[key] && existingLimits[key]?.consumption) req.body[key].consumption = existingLimits[key].consumption
    }
  }
  await db.collection('limits')
    .replaceOne({ type: req.params.type, id: req.params.id }, req.body, { upsert: true })
  res.send(req.body)
})

// A user can get limits information for himself only
router.get('/:type/:id', isAccountMember as RequestHandler, async (req, res, next) => {
  const limits = await getLimits({ type: req.params.type as 'user' | 'organization', id: req.params.id })
  if (!limits) {
    res.status(404).send()
    return
  }
  res.send(limits)
})

router.get('/', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const filter: Filter<Limits> = {}
  if (req.query.type) filter.type = req.query.type
  if (req.query.id) filter.id = req.query.id
  const results = await mongo.limits
    .find(filter)
    .sort({ lastUpdate: -1 })
    .project({ _id: 0 })
    .limit(10000)
    .toArray()
  res.send({ results, count: results.length })
})
