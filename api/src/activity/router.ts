// TODO: this will be replaced by a true activity concept based on a separate collection
// for now we create something similar based on recently updated datasets and applications

import { Router } from 'express'
import { reqSession } from '@data-fair/lib-express'
import * as findUtils from '../misc/utils/find.ts'
import { findActivityResources } from './service.ts'
import { mergeActivity } from './operations.ts'

const router = Router()
export default router

router.get('', async (req, res) => {
  const reqQuery = req.query as Record<string, string>
  const size = findUtils.pagination(reqQuery)[1]
  const { datasets, applications } = await findActivityResources(req.getLocale(), reqQuery, reqSession(req), size)
  res.send({ results: mergeActivity(datasets, applications, size) })
})
