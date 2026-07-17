// Dataset metadata CRUD: list, read, schema, patch, change-owner, delete (extracted from router.js, phase 6d)
import type { Router, Request, Response, NextFunction } from 'express'
import type { Request as DfRequest, Event } from '#types'
import clone from '@data-fair/lib-utils/clone.js'
import contentDisposition from 'content-disposition'
import debugModule from 'debug'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import { session, reqSession, reqSessionAuthenticated } from '@data-fair/lib-express'
import config from '#config'
import mongo from '#mongo'
import { readDataset, reqDataset, reqDatasetFull, lockDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite, apiKeyMiddlewareAdmin } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { can, reqResource } from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as publicationSites from '../../misc/utils/publication-sites.ts'
import * as journals from '../../misc/utils/journals.ts'
import * as notifications from '../../misc/utils/notifications.ts'
import { syncDataset as syncRemoteService } from '../../remote-services/service.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite } from '../../misc/utils/publication-sites.ts'
import { findDatasets, applyPatch, deleteDataset, changeDatasetOwner } from '../service.ts'
import * as partOf from '../../misc/utils/part-of.ts'
import { reqEventLogContext } from '../../misc/utils/req-context.ts'
import { preparePatch } from '../utils/patch.ts'
import * as datasetUtils from '../utils/index.ts'
import { tableSchema, jsonSchema, getSchemaBreakingChanges, filterSchema } from '../utils/data-schema.ts'
import { updateTotalStorage, checkMoveLimits } from '../utils/storage.ts'

const clean = datasetUtils.clean
const debugBreakingChanges = debugModule('breaking-changes')

// retrieve only the schema.. Mostly useful for easy select fields
const sendSchema = (req: Request, res: Response, schema: any) => {
  schema = filterSchema(schema, req.query as Record<string, string>)
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', contentDisposition(reqDataset(req).slug + '-tableschema.json'))
    schema = tableSchema(schema)
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', contentDisposition(reqDataset(req).slug + '-schema.json'))
    schema = jsonSchema(schema, reqPublicBaseUrl(req), req.query.arrays !== 'true')
  } else {
    for (const field of schema) {
      field.label = field.title || field['x-originalName'] || field.key
    }
  }
  res.status(200).send(schema)
}

const permissionsWritePublications = permissions.middleware('writePublications', 'admin')
const permissionsWriteExports = permissions.middleware('writeExports', 'admin')
const permissionsSetReadApiKey = permissions.middleware('setReadApiKey', 'admin')
const permissionsWritePartOf = permissions.middleware('writePartOf', 'admin')
const permissionsWriteDescription = permissions.middleware('writeDescription', 'write')

const descriptionBreakingKeys = ['rest', 'virtual', 'lineOwnership', 'primaryKey', 'projection', 'attachmentsAsImage', 'extensions', 'timeZone', 'slug'] // a change in these properties is considered a breaking change
const descriptionHasBreakingChanges = (req: Request) => {
  const breakingChangeKey = descriptionBreakingKeys.find(key => key in req.body)
  if (breakingChangeKey) {
    debugBreakingChanges('breaking change on key', breakingChangeKey)
    return true
  }
  if (!req.body.schema) return false
  // TODO: some change in calculated properties should also be rejected here ?
  const breakingChanges = getSchemaBreakingChanges(reqDataset(req).schema ?? [], req.body.schema, true, false)
  debugBreakingChanges('breaking changes in schema ? ', breakingChanges)
  return breakingChanges.length > 0
}
const permissionsWriteDescriptionBreaking = permissions.middleware('writeDescriptionBreaking', 'write')
const permissionsManageMasterData = permissions.canDoForOwnerMiddleware('manageMasterData', true)

export const registerMetadataRoutes = (router: Router) => {
  // Get the list of datasets
  router.get('', apiKeyMiddlewareRead, rateLimiting.middleware, cacheHeaders.listBased, async (req, res) => {
    const publicationSite = reqPublicationSite(req)
    const publicBaseUrl = reqPublicBaseUrl(req)
    const reqQuery = req.query as Record<string, string>

    const response = await findDatasets(mongo.db, req.getLocale(), publicationSite, publicBaseUrl, reqQuery, reqSession(req))
    for (const r of response.results) {
      datasetUtils.clean(req as DfRequest, r)
    }
    res.json(response)
  })

  router.use('/:datasetId/permissions', readDataset({ noCache: true }), apiKeyMiddlewareAdmin, rateLimiting.middleware, permissions.router('datasets', 'dataset', async (req, patchedDataset) => {
    // this callback function is called when the resource becomes public
    await publicationSites.onPublic(patchedDataset, 'datasets', reqSessionAuthenticated(req))
  }))

  // retrieve a dataset by its id
  router.get('/:datasetId', readDataset({ acceptInitialDraft: true, noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
    const dataset = clone(reqDataset(req))
    res.status(200).send(clean(req as DfRequest, dataset))
  })

  router.get('/:datasetId/schema', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
    sendSchema(req, res, clone(reqDataset(req).schema))
  })
  // alternate read schema route that does not return clues about the data (cardinality and enums)
  router.get('/:datasetId/safe-schema', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware('readSafeSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
    const schema = clone(reqDataset(req).schema ?? [])
    for (const p of schema) {
      delete p['x-cardinality']
      delete p.enum
    }
    sendSchema(req, res, schema)
  })

  // Update a dataset's metadata
  router.patch('/:datasetId',
    readDataset({
      acceptedStatuses: (patch, dataset) => {
        // accept different statuses of the dataset depending on the content of the patch
        if (!dataset.isMetaOnly && (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)) {
          return ['finalized', 'error']
        } else {
          return null
        }
      }
    }),
    apiKeyMiddlewareWrite, rateLimiting.middleware,
    lockDataset((patch: any) => {
      return !!(patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)
    }),
    (req: Request, res: Response, next: NextFunction) => req.body.masterData ? permissionsManageMasterData(req, res, next) : next(),
    (req: Request, res: Response, next: NextFunction) => {
      if (descriptionHasBreakingChanges(req)) {
        permissionsWriteDescriptionBreaking(req, res, next)
      } else if (can('datasets', reqResource(req), 'writeDescription', reqSession(req))) {
        permissionsWriteDescription(req, res, next)
      } else {
        // writeDescriptionBreaking implies writeDescription for non-breaking changes
        permissionsWriteDescriptionBreaking(req, res, next)
      }
    },
    (req: Request, res: Response, next: NextFunction) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
    (req: Request, res: Response, next: NextFunction) => req.body.exports ? permissionsWriteExports(req, res, next) : next(),
    (req: Request, res: Response, next: NextFunction) => req.body.readApiKey ? permissionsSetReadApiKey(req, res, next) : next(),
    (req: Request, res: Response, next: NextFunction) => ('partOf' in req.body) ? permissionsWritePartOf(req, res, next) : next(),
    async (req, res) => {
      // deep clone to allow mutation by applyPatch (req.dataset may be an immutable proxy from cache)
      const dataset: any = clone(reqDataset(req))

      const locale = req.getLocale()
      const sessionState = reqSessionAuthenticated(req)

      const patch: any = (await import('#doc/datasets/patch-req/index.js')).returnValid(req).body

      // dropping members from a virtual dataset can orphan datasets still defined as its partOf
      // children: detected (and refused) up-front, but applied only once the patch itself is
      // persisted — the cascade is irreversible and preparePatch/applyPatch can still reject the request
      const orphans = patch.virtual
        ? await partOf.detectOrphans('dataset', dataset, { ...dataset, ...patch }, req.query.childrenAction as string | undefined)
        : undefined

      const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale)

      if (!isEmpty) {
        await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
        await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate)
          .catch(err => {
            if (err.code !== 11000) throw err
            throw httpError(400, req.__('errors.dupSlug'))
          })

        await partOf.applyOrphans({ app: req.app, sessionState, logCtx: reqEventLogContext(req) }, 'dataset', dataset.id, orphans)

        if (patch.status && patch.status !== 'indexed' && patch.status !== 'finalized' && patch.status !== 'validation-updated') {
          await journals.log('datasets', dataset, { type: 'structure-updated' } as Event)
          await notifications.sendResourceEvent('datasets', dataset, sessionState, 'structure-updated', { extra: { patch: Object.keys(patch).join(', ') } })
        }

        eventsLog.info('df.datasets.patch', `patched dataset ${dataset.slug} (${dataset.id}), keys=${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

        const draft = !!dataset.draftReason
        eventsQueue.pushEvent({
          title: `Propriétés modifiées sur un ${draft ? 'brouillon de ' : ''}jeu de données`,
          body: `${draft ? 'brouillon ' : ''}${dataset.title} (${dataset.slug}), ${Object.keys(patch)?.join(', ')}`,
          topic: {
            key: `data-fair:dataset${draft ? '-draft' : ''}-patched-properties:${dataset.id}`
          },
          sender: dataset.owner,
          resource: { type: 'dataset', title: dataset.title, id: dataset.id }
        }, sessionState)

        await syncRemoteService(dataset)
      }

      res.status(200).json(clean(req as DfRequest, dataset))
    })

  // Change ownership of a dataset
  router.put('/:datasetId/owner', readDataset({ noCache: true }), apiKeyMiddlewareAdmin, rateLimiting.middleware, permissions.middleware('changeOwner', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)

    const sessionState = reqSessionAuthenticated(req)

    partOf.assertOwnerChangeAllowed(dataset)
    // only the dataset children weigh on the dataset limits checked below, but they all follow their parent
    const children = await partOf.listChildren('dataset', dataset.id)
    const movedDatasets = [dataset, ...children.filter(child => child.type === 'dataset').map(child => child.resource)]

    // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
    if (!sessionState.user.adminMode) {
      if (req.body.type === 'user' && req.body.id !== sessionState.user.id) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
      if (req.body.type === 'organization') {
        const userOrg = sessionState.user.organizations.find(o => o.id === req.body.id)
        if (!userOrg) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
        if (![config.contribRole, config.adminRole].includes(userOrg.role)) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
      }
    }

    if (req.body.type !== dataset.owner.type || req.body.id !== dataset.owner.id) {
      await checkMoveLimits(req.getLocale(), req.body, movedDatasets)
    }

    const patchedDataset = await changeDatasetOwner(dataset, req.body, sessionState)
    await partOf.changeChildrenOwner({ sessionState, logCtx: reqEventLogContext(req) }, 'dataset', dataset.id, req.body)

    const arrowStr = `${dataset.owner.name} (${dataset.owner.type}:${dataset.owner.id}) -> ${req.body.name} (${req.body.type}:${req.body.id})`
    const eventLogMessage = `changed dataset owner ${dataset.slug} (${dataset.id}), ${arrowStr}`

    eventsLog.info('df.datasets.changeOwnerFrom', eventLogMessage, { req, account: dataset.owner })
    eventsLog.info('df.datasets.changeOwnerTo', eventLogMessage, { req, account: req.body })
    const event = {
      title: 'Changement de propriétaire d\'un jeu de données',
      body: `${dataset.title} (${dataset.slug}), ${arrowStr}`,
      topic: {
        key: `data-fair:dataset-change-owner:${dataset.id}`
      },
      resource: { type: 'dataset', title: dataset.title, id: dataset.id },
      sender: { ...dataset.owner, role: 'admin' }
    }
    eventsQueue.pushEvent(event, sessionState)
    eventsQueue.pushEvent({ ...event, sender: { ...req.body, role: 'admin' } }, sessionState)

    await syncRemoteService(patchedDataset)

    await updateTotalStorage(dataset.owner)
    await updateTotalStorage(req.body)

    res.status(200).json(clean(req as DfRequest, patchedDataset))
  })

  // Delete a dataset
  router.delete('/:datasetId', readDataset({ acceptedStatuses: ['*'], alwaysDraft: true }), apiKeyMiddlewareAdmin, rateLimiting.middleware, permissions.middleware('delete', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    const datasetFull: any = reqDatasetFull(req)

    // children only exist to serve their parent: refuse the deletion unless childrenAction says what becomes of them
    await partOf.handleChildrenBeforeDeletion({ app: req.app, sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }, 'dataset', dataset, req.query.childrenAction as string | undefined)

    await deleteDataset(req.app, dataset)
    if (dataset.draftReason && datasetFull.status !== 'draft') {
      await deleteDataset(req.app, datasetFull)
    }

    eventsLog.info('df.datasets.delete', `dataset deleted ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
    const sessionState = await session.req(req)
    eventsQueue.pushEvent({
      title: 'Jeu de données supprimé',
      body: `${dataset.title} (${dataset.slug})`,
      topic: {
        key: `data-fair:dataset-delete:${dataset.id}`
      },
      sender: dataset.owner
    }, sessionState)

    await syncRemoteService({ ...datasetFull, masterData: null })
    await updateTotalStorage(datasetFull.owner)
    res.sendStatus(204)
  })
}
