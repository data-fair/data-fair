// Dataset creation, file update (POST/PUT) and draft validate/cancel routes (extracted from router.js, phase 6d)
import type { Router, RequestHandler, Response } from 'express'
import type { Request as DfRequest, Event } from '#types'
import mongo from '#mongo'
import fs from 'fs-extra'
import equal from 'deep-equal'
import slug from 'slugify'
import clone from '@data-fair/lib-utils/clone.js'
import debugModule from 'debug'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import { reqSession, reqSessionAuthenticated, type SessionStateAuthenticated } from '@data-fair/lib-express'
import config from '#config'
import { readDataset, reqDataset, reqDatasetOptional, reqDatasetFull, checkStorage, lockDataset, setReqDraft } from '../middlewares.ts'
import { apiKeyMiddlewareWrite } from './_common.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { can } from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as usersUtils from '../../misc/utils/users.ts'
import * as clamav from '../../misc/utils/clamav.ts'
import * as limits from '../../limits/service.ts'
import * as journals from '../../misc/utils/journals.ts'
import * as notifications from '../../misc/utils/notifications.ts'
import * as publicationSites from '../../misc/utils/publication-sites.ts'
import { emit as workerPing } from '../../workers/ping.ts'
import { syncDataset as syncRemoteService } from '../../remote-services/service.ts'
import { createDataset, applyPatch, cancelDraft } from '../service.ts'
import { preparePatch } from '../utils/patch.ts'
import { initDatasetIndex, switchAlias } from '../es/manage-indices.ts'
import * as restDatasetsUtils from '../utils/rest.ts'
import * as uploadUtils from '../utils/upload.ts'
import { updateStorage } from '../utils/storage.ts'
import { clearTaskProgress } from '../utils/task-progress.ts'
import * as datasetUtils from '../utils/index.ts'

const clean = datasetUtils.clean
const debugLimits = debugModule('limits')
const debugCreateDataset = debugModule('create-dataset')

// Create a dataset
const createDatasetRoute = async (req: DfRequest, res: Response) => {
  const db = mongo.db
  const es = req.app.get('es')
  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)
  const draft = req.query.draft === 'true'

  debugCreateDataset('upload files')
  const files = await uploadUtils.getFiles(req, res) as any[] | undefined
  debugCreateDataset('uploaded files', files)

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
      debugCreateDataset('clamav check ok')
    }

    req.body = uploadUtils.getFormBody(req.body)
    const { body } = (await import('#doc/datasets/post-req/index.js')).returnValid(req)

    const owner: any = usersUtils.owner(req)
    if (!permissions.canDoForOwner(owner, 'datasets', 'post', sessionState)) {
      throw httpError(403, req.__('errors.missingPermission'))
    }
    if ((await limits.remaining(owner)).nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/beforeUpload', { owner })
      throw httpError(429, req.__('errors.exceedLimitNbDatasets'))
    }

    // this is kept for retro-compatibility, but we should think of deprecating it
    // self chosen ids are not a good idea
    // there is a reason why we use a unique id generator and a slug system)
    const datasetId = req.params.datasetId as string | undefined
    if (datasetId) {
      if (!datasetId.match(/^[a-z0-9_\\-]+$/)) {
        throw httpError(400, req.__('errors.urlFriendly', { value: datasetId, slug: slug(datasetId, { lower: true, strict: true }) }))
      }
      (body as any).id = datasetId
    }

    const onClose = (callback: () => void) => res.on('close', callback)
    res.setMaxListeners(100)

    debugCreateDataset('call createDataset')
    const dataset = await createDataset(db, es, locale, sessionState, owner, body, files, draft, onClose)

    if (dataset.isRest && dataset.status === 'finalized') {
      debugCreateDataset('init rest dataset')
      // case where we simply initialize the empty dataset
      // being empty this is not costly and can be performed by the API
      await restDatasetsUtils.initDataset(dataset)
      const indexName = await initDatasetIndex(dataset)
      await switchAlias(dataset, indexName)
      await restDatasetsUtils.configureHistory(dataset)
      // the ES index was just built empty by the stamping code -> trivially fully stamped
      // (every doc has _bytes, vacuously true with zero docs), and the invariant holds forever
      // after since every REST write path indexes through the same stamping indexStream
      dataset._esLineBytes = true
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _esLineBytes: true } })
      await updateStorage(dataset)
      onClose(() => {
        // this is only to maintain compatibilty, but clients should look for the status in the response
        // and not wait for an event if the dataset is created already finalized
        journals.log('datasets', dataset, { type: 'finalize-end' } as Event).catch(err => {
          console.error('failure when send finalize-end to journal after rest dataset creation', err)
        })
      })
    }
    if (dataset.isMetaOnly) {
      await updateStorage(dataset)
    }

    eventsLog.info('df.datasets.create', `created a dataset ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

    debugCreateDataset('final steps')
    await journals.log('datasets', dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id } as Event)
    await notifications.sendResourceEvent('datasets', dataset, sessionState, 'dataset-created')
    await syncRemoteService(dataset)

    await workerPing('datasets', dataset.id)

    res.status(201).send(clean(req, dataset, draft))
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }
}

const updateDatasetRoute = async (req: DfRequest, res: Response) => {
  // deep clone to allow mutation by applyPatch (req.dataset may be an immutable proxy from cache)
  const dataset: any = clone(reqDatasetOptional(req))

  if (!dataset) {
    await createDatasetRoute(req, res)
    return
  }

  // force the file upload middleware to write files in draft directory, as updated datasets always go into draft mode
  setReqDraft(req, true)

  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)

  const files = await uploadUtils.getFiles(req, res) as any[] | undefined

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
    }

    req.body = uploadUtils.getFormBody(req.body)

    // this is also done inside preparePatch
    // but in the case of PUT we do it here to tolerate properties usually used at creation time
    for (const key of Object.keys(req.body)) {
      if (equal(req.body[key], dataset[key])) { delete req.body[key] }
    }
    if (req.body.owner && req.body.owner.type === dataset.owner.type && req.body.owner.id === dataset.owner.id) {
      delete req.body.owner
    }

    const patch: any = (await import('#doc/datasets/patch-req/index.js')).returnValid(req).body

    // TODO: do not use always as default value when the dataset is public or published ?
    const canBreak = can('datasets', dataset, 'writeDescriptionBreaking', reqSession(req))
    let draftValidationMode
    if (reqDatasetFull(req).status === 'draft') {
      draftValidationMode = 'never'
    } else {
      if (req.query.draft === 'true') {
        if ((patch.schema ?? dataset.schema).find((f: any) => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) draftValidationMode = 'never'
        else draftValidationMode = 'compatible'
      } else {
        draftValidationMode = req.query.draft ?? 'always'
      }
    }

    if (!['never', 'always', 'compatible', 'compatibleOrCancel'].includes(draftValidationMode)) throw httpError(400, `unknown value for draft validation mode ${draftValidationMode}`)
    if (!canBreak && draftValidationMode === 'always') throw httpError(403, 'draft mode "always" is not permitted')

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale, draftValidationMode, files)
      .catch(err => {
        if (err.code !== 11000) throw err
        throw httpError(400, req.__('errors.dupSlug'))
      })

    if (!isEmpty) {
      await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
      await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate)

      eventsLog.info('df.datasets.update', `updated dataset ${dataset.slug} (${dataset.id}) keys ${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

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

      if (files) {
        await journals.log('datasets', dataset, { type: 'data-updated' } as Event)
        await notifications.sendResourceEvent('datasets', dataset, sessionState, 'data-updated')
      }
      await syncRemoteService(dataset)
    }
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }

  res.status(200).json(clean(req, dataset))
}

export const registerWriteRoutes = (router: Router) => {
  router.post('', apiKeyMiddlewareWrite, rateLimiting.middleware, checkStorage(true, true), createDatasetRoute as unknown as RequestHandler)

  router.post('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute as unknown as RequestHandler)
  router.put('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute as unknown as RequestHandler)

  // validate the draft
  // TODO: apply different permission if draft has breaking changes or not
  router.post('/:datasetId/draft', readDataset({ acceptedStatuses: ['finalized'], alwaysDraft: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('validateDraft', 'write'), lockDataset(), async (req, res, next) => {
    const dataset: any = clone(reqDataset(req))
    const sessionState = reqSession(req)

    if (!reqDatasetFull(req).draft) {
      return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
    }

    const patch = { status: 'validated', validateDraft: true }
    await applyPatch(dataset, patch)
    await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation manuelle' } as Event)
    await notifications.sendResourceEvent('datasets', dataset, sessionState as SessionStateAuthenticated, 'draft-validated', { localizedParams: { fr: { cause: 'validation manuelle' }, en: { cause: 'manual validation' } } })
    eventsLog.info('df.datasets.validateDraft', `validated dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

    return res.send(dataset)
  })

  // cancel the draft
  router.delete('/:datasetId/draft', readDataset({ acceptedStatuses: ['draft', 'finalized', 'error'], alwaysDraft: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('cancelDraft', 'write'), lockDataset(), async (req, res, next) => {
    const dataset: any = clone(reqDataset(req))
    const sessionState = reqSession(req)
    const datasetFull: any = clone(reqDatasetFull(req))

    if (datasetFull.status === 'draft') {
      return res.status(409).send('Impossible d\'annuler un brouillon si aucune version du jeu de données n\'a été validée.')
    }
    if (!datasetFull.draft) {
      return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
    }
    const patch = { draft: null }
    await cancelDraft(dataset)
    await applyPatch(datasetFull, patch)
    // the draft may have left a failed task progress (e.g. unicity error during indexing);
    // no worker will run on the dataset after the cancellation, so clear it here
    await clearTaskProgress(dataset.id)
    // NOTE: the original call passed a stray 5th `sessionState` arg that journals.log (4 params) ignored;
    // dropped here as a behavior-preserving no-op (parking lot: verify draft-cancelled journal context)
    await journals.log('datasets', dataset, { type: 'draft-cancelled' } as Event, false)

    eventsLog.info('df.datasets.cancelDraft', `cancelled dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
    await notifications.sendResourceEvent('datasets', dataset, sessionState as SessionStateAuthenticated, 'draft-cancelled')

    await updateStorage(datasetFull)

    return res.send(datasetFull)
  })
}
