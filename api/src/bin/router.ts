import express from 'express'
import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import { canSeeBin } from './operations.ts'
import { binActiveFor, listBin, getBinItem, restore, purgeItem } from './service.ts'

// No allowAnyScope mark: a scoped session is refused (403) on every bin route, as on settings writes.
const router = express.Router()

const reqType = (type: string) => {
  if (type !== 'datasets' && type !== 'applications') throw httpError(400, 'type must be datasets or applications')
  return type
}

router.get('', cacheHeaders.noCache, async (req, res) => {
  const sessionState = reqSessionAuthenticated(req)
  const account = sessionState.account
  if (account.type !== 'organization' || !(await binActiveFor(account))) throw httpError(404, 'La corbeille n\'est pas activée pour ce compte')
  if (!canSeeBin(sessionState, account, config.adminRole)) throw httpError(403, 'Seuls les administrateurs peuvent consulter la corbeille')
  const q = typeof req.query.q === 'string' && req.query.q ? req.query.q : undefined
  res.status(200).send(await listBin(account, q))
})

router.post('/:type/:id/_restore', async (req, res) => {
  const sessionState = reqSessionAuthenticated(req)
  const type = reqType(req.params.type)
  const item = await getBinItem(type, req.params.id)
  if (!canSeeBin(sessionState, item.owner, config.adminRole)) throw httpError(403, 'Seuls les administrateurs peuvent restaurer depuis la corbeille')
  await restore(sessionState, type, item.id)
  res.status(204).send()
})

router.delete('/:type/:id', async (req, res) => {
  const sessionState = reqSessionAuthenticated(req)
  const type = reqType(req.params.type)
  const item = await getBinItem(type, req.params.id)
  if (!canSeeBin(sessionState, item.owner, config.adminRole)) throw httpError(403, 'Seuls les administrateurs peuvent supprimer définitivement depuis la corbeille')
  await purgeItem(type, item.id)
  res.status(204).send()
})

export default router
