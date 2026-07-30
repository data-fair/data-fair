// shared middlewares used across the datasets route groups (extracted from router.js, phase 6d)
import type { RequestHandler } from 'express'
import * as apiKeyUtils from '../../misc/utils/api-key.ts'
import { readDataset, reqDataset } from '../middlewares.ts'

export const apiKeyMiddlewareRead = apiKeyUtils.middleware(['datasets', 'datasets-read'])
export const apiKeyMiddlewareWrite = apiKeyUtils.middleware(['datasets', 'datasets-write'])
export const apiKeyMiddlewareAdmin = apiKeyUtils.middleware(['datasets', 'datasets-admin'])

// CRUD operations for REST datasets
export const isRest: RequestHandler = (req, res, next) => {
  if (!reqDataset(req).isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données éditables.')
  }
  next()
}

export const readWritableDataset = readDataset({ acceptedStatuses: ['finalized', 'indexed', 'error'] })
