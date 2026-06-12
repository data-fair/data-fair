// TODO: this will be replaced by a true activity concept based on a separate collection
// for now we create something similar based on recently updated datasets and applications

import { Router } from 'express'
import * as findUtils from '../misc/utils/find.js'
import { findActivityResources } from './service.ts'
import { mergeActivity } from './operations.ts'

const router = Router()
export default router

router.get('', async (req, res) => {
  // NOTE: this query() call uses an obsolete 2-arg signature and currently throws at runtime
  // (find.js query() now requires a fieldsMap). Preserved bit-for-bit by the express-decoupling
  // refactor — see the parking lot in docs/plans/2026-06-12-refactor-tiny-modules.md.
  const query = findUtils.query(req, { status: 'status' })
  const size = findUtils.pagination(req.query)[1]
  const { datasets, applications } = await findActivityResources(query, size)
  res.send({ results: mergeActivity(datasets, applications, size) })
})
