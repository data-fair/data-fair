// Routes used to synchronize data with the users/organizations directory.
// Useful both for functionalities and to help respect GDPR rules.

import { type Application, Router } from 'express'
import { createIdentitiesRouter } from '@data-fair/lib-express/identities/index.js'
import { assertReqInternalSecret } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import { renameIdentity, deleteIdentity, reportIdentity } from './service.ts'

export default (app: Application) => {
  const router = Router()

  // the shared router has no report yet (501), keep ours ahead of it with the same guard
  router.get('/:type/:id/report', async (req, res) => {
    assertReqInternalSecret(req, config.secretKeys.identities ?? '')
    if (typeof req.params.type !== 'string' || typeof req.params.id !== 'string') throw httpError(400, 'invalid path parameters')
    res.send(await reportIdentity({ type: req.params.type, id: req.params.id }))
  })

  router.use(createIdentitiesRouter(
    config.secretKeys.identities,
    // onUpdate: propagate a name change, reconcile the permissions granted to partners
    async (identity) => {
      await renameIdentity(identity, identity.departments, identity.partners)
    },
    // onDelete: remove resources owned, permissions and the data directory
    async (identity) => {
      await deleteIdentity(app, identity)
    }
  ))

  return router
}
