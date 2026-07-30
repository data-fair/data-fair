import express from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import * as notifications from '../misc/utils/notifications.ts'
import config from '#config'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import { buildPublicationSiteSubscriptions } from './operations.ts'
import * as service from './service.ts'
import { settingsParamsMiddleware, isOwnerAdmin, isOwnerMember, reqSettingsParams, reqWriteContext } from './middlewares.ts'

const router = express.Router()

router.use('/:type/:id', settingsParamsMiddleware)

// read settings as owner
router.get('/:type/:id', isOwnerAdmin, cacheHeaders.noCache, async (req, res) => {
  res.status(200).send(await service.getSettings(reqSettingsParams(req)))
})

// update settings as owner
router.put('/:type/:id', isOwnerAdmin, async (req, res) => {
  res.status(200).send(await service.updateSettings(reqWriteContext(req), req.body))
})
router.patch('/:type/:id', isOwnerAdmin, async (req, res) => {
  res.status(200).send(await service.patchSettings(reqWriteContext(req), req.body))
})

// Get topics list as owner
router.get('/:type/:id/topics', isOwnerMember, async (req, res) => {
  res.status(200).send(await service.getTopics(reqSettingsParams(req)))
})

// Get licenses list as anyone
router.get('/:type/:id/licenses', cacheHeaders.noCache, async (req, res) => {
  res.status(200).send(await service.getLicenses(reqSettingsParams(req)))
})

// Get datasets metadata settings as owner
router.get('/:type/:id/datasets-metadata', isOwnerMember, async (req, res) => {
  res.status(200).send(await service.getDatasetsMetadata(reqSettingsParams(req)))
})

// Get agent chat setting as member
router.get('/:type/:id/agent-chat', isOwnerMember, cacheHeaders.noCache, async (req, res) => {
  res.status(200).send(await service.getAgentChat(reqSettingsParams(req)))
})

// Get publication sites as owner
router.get('/:type/:id/publication-sites', isOwnerMember, async (req, res) => {
  reqSessionAuthenticated(req)
  res.status(200).send(await service.getPublicationSites(reqSettingsParams(req)))
})
// create/update publication sites as owner (used by data-fair-portals to sync portals)
router.post('/:type/:id/publication-sites', isOwnerAdmin, async (req, res) => {
  const ctx = reqWriteContext(req)
  const { created } = await service.upsertPublicationSite(ctx, req.body)
  if (created) {
    for (const subscription of buildPublicationSiteSubscriptions(ctx.owner, req.body, config.publicUrl)) {
      notifications.subscribe(req, subscription)
    }
  }
  res.status(200).send(req.body)
})
// delete publication sites as owner (used by data-fair-portals to sync portals)
router.delete('/:type/:id/publication-sites/:siteType/:siteId', isOwnerAdmin, async (req, res) => {
  const { siteType, siteId } = req.params
  if (typeof siteType !== 'string' || typeof siteId !== 'string') throw httpError(400, 'invalid path parameters')
  await service.deletePublicationSite(reqWriteContext(req), siteType, siteId)
  res.status(200).send(req.body)
})

export default router
