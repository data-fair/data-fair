// Dataset metadata CRUD: list, read, schema, patch, change-owner, delete (extracted from router.js, phase 6d)
import type { Router, Request, Response, NextFunction } from 'express'
import type { Request as DfRequest, Event } from '#types'
import clone from '@data-fair/lib-utils/clone.js'
import contentDisposition from 'content-disposition'
import debugModule from 'debug'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { session, reqSession, reqSessionAuthenticated } from '@data-fair/lib-express'
import config from '#config'
import mongo from '#mongo'
import { readDataset, reqDataset, reqDatasetFull, lockDataset, assertWriteBodyPermissions } from '../middlewares.ts'
import { safeDescription, safeSchema } from '../operations.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite, apiKeyMiddlewareAdmin } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import { getAsVisitorContext } from '../../misc/utils/as-visitor.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { can, reqResource } from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as publicationSites from '../../misc/utils/publication-sites.ts'
import * as journals from '../../misc/utils/journals.ts'
import * as notifications from '../../misc/utils/notifications.ts'
import * as webhooks from '../../misc/utils/webhooks.ts'
import * as usersUtils from '../../misc/utils/users.ts'
import i18n from 'i18n'
import { type Locale } from '../../../i18n/utils.ts'
import * as limits from '../../limits/service.ts'
import { syncDataset as syncRemoteService } from '../../remote-services/service.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite } from '../../misc/utils/publication-sites.ts'
import { findDatasets, applyPatch, deleteDataset, changeDatasetOwner } from '../service.ts'
import { hasAttachmentField } from '../../integrity/service.ts'
import { whoFromReq } from '../../integrity/who.ts'
import * as fragmentsService from '../../fragments/service.ts'
import { fragmentWriteGuard } from '../../fragments/middlewares.ts'
import { reqEventLogContext, reqBypassPermissions } from '../../misc/utils/req-context.ts'
import { preparePatch } from '../utils/patch.ts'
import * as datasetUtils from '../utils/index.ts'
import { tableSchema, jsonSchema, getSchemaBreakingChanges, schemasFullyCompatible, filterSchema } from '../utils/data-schema.ts'
import { filterByContextualCardinality, filterByUniqueValues, createEsRequestOptions, hasDataFilters } from '../es/index.ts'
import { manageESError } from './_es-error.ts'
import { updateTotalStorage } from '../utils/storage.ts'
import { prepareCustomMetadata } from '../utils/custom-metadata.ts'

const clean = datasetUtils.clean
const debugBreakingChanges = debugModule('breaking-changes')

// retrieve only the schema.. Mostly useful for easy select fields
const sendSchema = async (req: Request, res: Response, schema: any, contextualCardinality = false) => {
  const reqQuery = req.query as Record<string, string>
  const filtered = hasDataFilters(reqQuery)
  const uniqueValues = reqQuery.uniqueValues === 'true'
  const contextualMaxCardinality = !!reqQuery.maxCardinality && filtered
  if (contextualCardinality && (contextualMaxCardinality || uniqueValues)) {
    // which columns survive tells whether some line matches the filters, e.g. maxCardinality=0
    // keeps a column iff no line does, uniqueValues tells how many lines match at most: that is a
    // read of the lines, not of the schema
    if (filtered && !can('datasets', reqResource(req), 'readLines', reqSession(req), reqBypassPermissions(req))) {
      throw httpError(403, 'Permission manquante pour l\'opération "readLines", nécessaire pour filtrer le schéma par des filtres sur les données.')
    }
    // contextual cardinality: the schema filters are applied first (without maxCardinality) to
    // bound the number of ES sub-aggregations, then the fields are filtered by their cardinality
    // within the context of the data filters, instead of the stored whole-dataset cardinality;
    // uniqueValues compares distinct values to matching lines in ES, with or without data filters
    // this path runs an ES query, so unlike the plain schema read it gets the same cache headers
    // as the data endpoints; the reference date is the latest of updatedAt (schema metadata edits)
    // and finalizedAt (data changes, refreshed cardinalities)
    const dataset = reqDataset(req)
    const cacheTimes = [dataset.updatedAt, dataset.finalizedAt].filter((d): d is string => !!d).map(d => new Date(d).getTime())
    const cacheDate = new Date(Math.max(...cacheTimes))
    if (cacheHeaders.applyResourceCacheHeaders(req, res, cacheDate)) return
    const schemaQuery: Record<string, string> = { ...reqQuery }
    if (contextualMaxCardinality) delete schemaQuery.maxCardinality
    schema = filterSchema(schema, schemaQuery)
    try {
      const esOptions = createEsRequestOptions(req, res)
      if (contextualMaxCardinality) schema = await filterByContextualCardinality(dataset, schema, reqQuery, Number(reqQuery.maxCardinality), esOptions)
      if (uniqueValues) schema = await filterByUniqueValues(dataset, schema, reqQuery, filtered, esOptions)
    } catch (err) {
      await manageESError(req, err)
    }
  } else {
    schema = filterSchema(schema, reqQuery)
    // the safe schema gives no clue about the data, no column can be told to hold unique values
    if (uniqueValues) schema = []
  }
  if (reqQuery.mimeType === 'application/tableschema+json') {
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
// the per key checks shared with POST/PUT /datasets/:id (read API key, master data, publications,
// exports); the last operation checked is reported as x-operation, as its own middleware did
const permissionsWriteBody = (req: Request, res: Response, next: NextFunction) => {
  const operation = assertWriteBodyPermissions(reqResource(req), req.body, reqSession(req), reqBypassPermissions(req))
  if (operation) {
    permissions.setReqOperation(req, operation)
    res.setHeader('x-operation', JSON.stringify(operation))
  }
  next()
}

export const registerMetadataRoutes = (router: Router) => {
  // Get the list of datasets
  router.get('', apiKeyMiddlewareRead, rateLimiting.middleware, cacheHeaders.listBased, async (req, res) => {
    const publicationSite = reqPublicationSite(req)
    const publicBaseUrl = reqPublicBaseUrl(req)
    const reqQuery = req.query as Record<string, string>

    // an org admin can browse the list as a hypothetical visitor (access audit view)
    let sessionState = reqSession(req)
    let asVisitorFilters: any[] | undefined
    if (reqQuery.asVisitor) {
      const ctx = getAsVisitorContext(reqQuery.asVisitor, sessionState, config.adminRole as string, 'datasets')
      sessionState = ctx.sessionState
      asVisitorFilters = [ctx.ownerFilter]
    }

    const response = await findDatasets(mongo.db, req.getLocale(), publicationSite, publicBaseUrl, reqQuery, sessionState, { extraFilters: asVisitorFilters })
    for (const r of response.results) {
      // tell the auditing admin why the visitor reaches each resource (computed before clean drops permissions)
      if (asVisitorFilters) r.accessSources = permissions.accessSources('datasets', r, sessionState)
      datasetUtils.clean(req as DfRequest, r, false, sessionState)
    }
    res.json(response)
  })

  router.use('/:datasetId/permissions', readDataset({ noCache: true }), apiKeyMiddlewareAdmin, rateLimiting.middleware, permissions.router('datasets', 'dataset', async (req, patchedDataset) => {
    // this callback function is called when the resource becomes public
    await publicationSites.onPublic(patchedDataset, 'datasets', reqSessionAuthenticated(req))
  }, async (patchedDataset) => {
    await fragmentsService.syncFragmentPermissions('datasets', patchedDataset)
    // no application-key cache invalidation here on purpose: all five memos in application-key.ts
    // are keyed on an application id and hold application documents only, so a dataset ACL change
    // cannot make any of them stale — clearing them would just cold-flush hot memos
  }))

  // retrieve a dataset by its id
  // a readSafeDescription holder (e.g. a crowd-sourcing contributor) gets the metadata without what reflects the data
  router.get('/:datasetId', readDataset({ acceptInitialDraft: true, noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware(['readDescription', 'readSafeDescription'], 'read'), cacheHeaders.noCache, (req, res, next) => {
    const dataset = clone(reqDataset(req))
    const full = can('datasets', dataset, 'readDescription', reqSession(req), permissions.reqBypassPermissions(req))
    const cleaned = clean(req as DfRequest, dataset)
    res.status(200).send(full ? cleaned : safeDescription(cleaned))
  })

  // fillDescendants is required by prepareQuery when the contextual maxCardinality filter
  // runs on a virtual dataset (data filters are then resolved against the descendants)
  router.get('/:datasetId/schema', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, async (req, res) => {
    await sendSchema(req, res, clone(reqDataset(req).schema), true)
  })
  // alternate read schema route that does not return clues about the data (cardinality and enums)
  router.get('/:datasetId/safe-schema', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, applicationKey, permissions.middleware('readSafeSchema', 'read'), cacheHeaders.noCache, async (req, res) => {
    await sendSchema(req, res, safeSchema(clone(reqDataset(req).schema ?? [])))
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
    permissionsWriteBody,
    // fragments are never publishable — shared with the other three write routes (spec §5)
    fragmentWriteGuard(true),
    async (req, res) => {
      // deep clone to allow mutation by applyPatch (req.dataset may be an immutable proxy from cache)
      const dataset: any = clone(reqDataset(req))

      const locale = req.getLocale()
      const sessionState = reqSessionAuthenticated(req)

      const patch: any = (await import('#doc/datasets/patch-req/index.js')).returnValid(req).body
      if (patch.customMetadata) await prepareCustomMetadata(dataset.owner, patch.customMetadata, dataset.customMetadata)

      // partOf changes are a dedicated write (spec §5); the publication-keys refusal is applied by
      // the fragmentWriteGuard mounted above, shared with every other write route
      if ('partOf' in patch) {
        const updated = await fragmentsService.applyPartOfChange('datasets', dataset, patch.partOf, sessionState, whoFromReq(req))
        delete patch.partOf
        if (updated.partOf) dataset.partOf = updated.partOf
        else delete dataset.partOf
        dataset.permissions = updated.permissions
        dataset.updatedAt = updated.updatedAt
        eventsLog.info('df.datasets.partOf', `changed dataset parentage ${dataset.slug} (${dataset.id}) -> ${JSON.stringify(dataset.partOf ?? null)}`, { req, account: dataset.owner })
      }

      // integrity truth-grounding (mirror of the enable-time refusals in integrity/service.ts):
      // attachments and line ownership are outside the integrity snapshot, so acquiring them
      // while enrolled would silently degrade the stated guarantee — refuse the transition,
      // same posture as the owner-transfer refusal below. Disable integrity first.
      if (dataset.integrity?.active) {
        if (patch.rest?.lineOwnership && !dataset.rest?.lineOwnership) {
          throw httpError(400, 'line ownership cannot be enabled while integrity is active: line owner attribution is not covered by the integrity guarantee')
        }
        if (patch.schema && hasAttachmentField({ ...dataset, schema: patch.schema }) && !hasAttachmentField(dataset)) {
          throw httpError(400, 'an attachments field cannot be added while integrity is active: attachment files are not covered by the integrity guarantee')
        }
      }

      // applyPatch does Object.assign(dataset, patch), so the pre-patch schema has to be kept aside
      // to diff it below
      const previousSchema = dataset.schema
      const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale)

      if (!isEmpty) {
        await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
        await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate, whoFromReq(req))
          .catch(err => {
            if (err.code !== 11000) throw err
            throw httpError(400, req.__('errors.dupSlug'))
          })

        // applyPatch may overwrite patch.status to 'indexed' when ES accepts the new mapping
        // in place (REST column added), so check the schema diff directly.
        const schemaChanged = !!patch.schema && !schemasFullyCompatible(patch.schema, previousSchema, true)
        const reprocessingTriggered = patch.status && patch.status !== 'indexed' && patch.status !== 'finalized' && patch.status !== 'validation-updated'
        if (schemaChanged || reprocessingTriggered) {
          await journals.log('datasets', dataset, { type: 'structure-updated' } as Event)
          await notifications.sendResourceEvent('datasets', dataset, sessionState, 'structure-updated', { extra: { patch: Object.keys(patch).join(', ') } })
        }

        // REST and virtual datasets skip the draft-validation flow that emits breaking-change
        // in service.ts; emit it inline here on backward-incompatible PATCHes.
        if ((dataset.isRest || dataset.isVirtual) && patch.schema) {
          const breakingChanges = getSchemaBreakingChanges(previousSchema, patch.schema, false, false)
          if (breakingChanges.length) {
            const localizedParams = i18n.getLocales().reduce<Record<string, Record<string, string>>>((a, locale) => {
              let msg = i18n.__({ phrase: 'hasBreakingChanges', locale }, { title: dataset.title })
              for (const breakingChange of breakingChanges) {
                msg += '\n' + i18n.__({ phrase: 'breakingChanges.' + breakingChange.type, locale }, { key: breakingChange.key })
              }
              a[locale] = { breakingChanges: msg }
              return a
            }, {})
            const i18nKey = breakingChanges.length === 1 ? 'breaking-change' : 'breaking-changes'
            webhooks.trigger('datasets', dataset, { type: 'breaking-change', body: localizedParams } as any, null)
            await notifications.sendResourceEvent('datasets', dataset, sessionState, 'breaking-change', { i18nKey, localizedParams: localizedParams as Record<Locale, Record<string, string>> })
          }
        }

        eventsLog.info('df.datasets.patch', `patched dataset ${dataset.slug} (${dataset.id}), keys=${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

        const draft = !!dataset.draftReason
        await notifications.send({
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
    usersUtils.normalizeOwner(req.body)

    if (dataset.partOf) throw httpError(403, 'Un fragment ne peut pas changer de propriétaire, détachez-le d\'abord')

    // integrity anchors are owner-scoped (data-fair/‹owner.type›-‹owner.id›/…): transferring
    // would orphan the anchor sequence. Deliberate simplification: disable integrity first.
    if (dataset.integrity?.active) {
      return res.status(400).type('text/plain').send('Le contrôle d\'intégrité doit être désactivé avant un changement de propriétaire')
    }

    const sessionState = reqSessionAuthenticated(req)

    // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
    // (checked against all the user's memberships, the new owner is rarely the active account)
    if (!permissions.canDoForOwner(req.body, 'datasets', 'post', sessionState, true)) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))

    // fragments have their parent's owner: they follow it, like they follow its deletion
    const fragments = await fragmentsService.prepareFragmentsOwnerChange('dataset', dataset, req.body, sessionState)

    const limitError = await limits.changeOwnerLimitError(dataset.owner, req.body, [dataset, ...fragments.datasets])
    if (limitError) return res.status(429).type('text/plain').send(req.__('errors.' + limitError))

    const ctx = { sessionState, logCtx: reqEventLogContext(req) }
    const newPermissions = await permissions.ownerChangePermissions(dataset, req.body)
    await fragmentsService.changeFragmentsOwner(ctx, 'datasets', fragments, req.body, newPermissions)
    const patchedDataset = await changeDatasetOwner(ctx, dataset, reqDatasetFull(req), req.body, newPermissions)

    await updateTotalStorage(dataset.owner)
    await updateTotalStorage(req.body)

    res.status(200).json(clean(req as DfRequest, patchedDataset))
  })

  // Delete a dataset
  router.delete('/:datasetId', readDataset({ acceptedStatuses: ['*'], alwaysDraft: true }), apiKeyMiddlewareAdmin, rateLimiting.middleware, permissions.middleware('delete', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    const datasetFull: any = reqDatasetFull(req)

    // fragments first: a failed fragment deletion leaves a still-consistent parent (spec §6)
    await fragmentsService.deleteFragments(req.app, { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }, 'dataset', dataset.id, dataset.owner)

    await deleteDataset(req.app, dataset)
    if (dataset.draftReason && datasetFull.status !== 'draft') {
      await deleteDataset(req.app, datasetFull)
    }

    eventsLog.info('df.datasets.delete', `dataset deleted ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
    const sessionState = await session.req(req)
    await notifications.send({
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
