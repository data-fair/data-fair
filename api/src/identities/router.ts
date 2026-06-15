// Routes used to synchronize data with the users/organizations directory.
// Useful both for functionalities and to help respect GDPR rules.

import { Router } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import { renameIdentity, deleteIdentity, reportIdentity } from './service.ts'

const router = Router()
export default router

router.use((req, res, next) => {
  if (!config.secretKeys.identities || config.secretKeys.identities !== req.query.key) {
    return res.status(403).type('text/plain').send('Bad secret in "key" parameter')
  }
  next()
})

// notify a name change
router.post('/:type/:id', async (req, res) => {
  if (typeof req.params.type !== 'string' || typeof req.params.id !== 'string') throw httpError(400, 'invalid path parameters')
  await renameIdentity({ type: req.params.type, id: req.params.id, name: req.body.name }, req.body.departments)
  res.send()
})

// Remove resources owned, permissions and anonymize created and updated
router.delete('/:type/:id', async (req, res) => {
  if (typeof req.params.type !== 'string' || typeof req.params.id !== 'string') throw httpError(400, 'invalid path parameters')
  await deleteIdentity(req.app, { type: req.params.type, id: req.params.id })
  res.send()
})

// Ask for a report of every piece of data in the service related to an identity
router.get('/:type/:id/report', async (req, res) => {
  res.send(await reportIdentity(req.query))
})
