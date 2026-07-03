import mongo from '#mongo'
import path from 'node:path'
import equal from 'deep-equal'
import moment from 'moment'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime-types'
import config from '#config'
import * as geo from './geo.ts'
import * as datasetUtils from './index.ts'
import * as extensions from './extensions.ts'
import { checkConstraints } from './constraints.ts'
import * as schemaUtils from './data-schema.ts'
import * as virtualDatasetsUtils from './virtual.ts'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import catalogsPublicationQueue from '../../misc/utils/catalogs-publication-queue.ts'
import type { SessionStateAuthenticated } from '@data-fair/lib-express'

export const preparePatch = async (app: any, patch: any, dataset: any, sessionState: SessionStateAuthenticated, locale: string, draftValidationMode?: string, files?: any[]): Promise<{ removedRestProps?: any[], attemptMappingUpdate?: boolean, isEmpty?: boolean }> => {
  const db = mongo.db

  // Strip publicUrl from image URL for multi-domain compatibility
  if (patch.image?.startsWith(config.publicUrl)) {
    patch.image = patch.image.slice(config.publicUrl.length)
  }

  patch.id = dataset.id
  patch.slug = patch.slug || dataset.slug
  datasetUtils.setUniqueRefs(patch)
  datasetUtils.curateDataset(patch)

  // `constraints: null` is the documented "unset" idiom (makePatchSchema allows it), meaning
  // "remove all constraints". Normalize it to `[]` as early as possible so that every consumer
  // downstream (the constraints check below, applyPatch's $set/$unset choice, and the index-lines
  // worker's diagnostic-cleanup gate which keys off `dataset.constraints` truthiness) sees the same
  // "empty array" shape that the UI already produces when a constraint is dropped, instead of a
  // field that gets entirely $unset from the document.
  if (patch.constraints === null) patch.constraints = []

  // Changed a previously failed dataset, retry the previous step
  if (dataset.status === 'error') {
    if (dataset.errorStatus) {
      patch.status = dataset.errorStatus
      patch.errorStatus = null
      patch.errorRetry = null
    } else if (dataset.isVirtual) patch.status = 'indexed'
    else if (dataset.isRest) patch.status = 'analyzed'
    else patch.status = 'stored'

    await wsEmitter.emit('datasets/' + dataset.id + '/task-progress', {})
    await mongo.db.collection('journals').updateOne({ type: 'dataset', id: dataset.id }, { $unset: { taskProgress: 1 } })
  }

  const datasetFile = files && files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
  const attachmentsFile = files?.find(f => f.fieldname === 'attachments')

  if (datasetFile) {
    if (!dataset.file && !dataset.loaded) throw httpError(400, 'this dataset is not file based')
    patch.loaded = {
      dataset: {
        name: datasetFile.originalname,
        size: datasetFile.size,
        mimetype: datasetFile.mimetype,
        explicitEncoding: datasetFile.explicitEncoding,
        normalizeOptions: datasetFile.normalizeOptions
      }
    }
  }
  if (attachmentsFile) {
    patch.loaded = patch.loaded || {}
    patch.loaded.attachments = true
  }

  if (patch.attachments) {
    patch._attachmentsTargets = []
    for (const attachment of patch.attachments) {
      if (['file', 'remoteFile'].includes(attachment.type) && attachment.name && !attachment.mimetype) {
        if (!path.extname(attachment.name)) throw httpError(400, `Le nom de fichier de la pièce jointe ${attachment.name} ne contient pas d'extension.`)
        const mimetype = mime.lookup(attachment.name)
        if (mimetype) attachment.mimetype = mimetype
      }
      if (attachment.type === 'remoteFile') {
        if (attachment.targetUrl) {
          patch._attachmentsTargets.push({ ...attachment })
          delete attachment.targetUrl
        } else {
          const existingAttachmentTarget = dataset._attachmentsTargets?.find((a: any) => a.name === attachment.name)
          if (!existingAttachmentTarget) {
            throw httpError(400, `Impossible de créer la pièce jointe ${attachment.name} sans URL cible`)
          }
          const attachmentTarget = { ...existingAttachmentTarget, ...attachment }
          patch._attachmentsTargets.push(attachmentTarget)
        }
      }
    }
  }

  // Ignore patch that doesn't bring actual change
  for (const patchKey of Object.keys(patch)) {
    if (equal(patch[patchKey], dataset[patchKey])) { delete patch[patchKey] }
  }
  if (Object.keys(patch).length === 0) return { isEmpty: true }

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  if (datasetFile || attachmentsFile) {
    patch.dataUpdatedAt = patch.updatedAt
    patch.dataUpdatedBy = patch.updatedBy
  }

  if (patch.extensions) extensions.prepareExtensions(locale, patch.extensions, dataset.extensions ?? [])
  // extendedSchema computed by either branch below already covers everything checkConstraints
  // needs (real columns with their final type/x-capabilities/x-refersTo, plus x-calculated and
  // x-extension columns flagged as such) so it is reused instead of being recomputed a 3rd time.
  // Note: in the extensions branch, `patch.schema` itself ends up holding the *extensions*-prepared
  // schema (prepareExtensionsSchema), not the extended one — so we keep a reference to the local
  // `extendedSchema` from that branch rather than reusing `patch.schema` there.
  let extendedSchemaForConstraints
  if (patch.extensions || dataset.extensions) {
    const extendedSchema = await schemaUtils.extendedSchema(db, { ...dataset, ...patch })
    await extensions.checkExtensions(extendedSchema, patch.extensions || dataset.extensions)
    patch.schema = await extensions.prepareExtensionsSchema(patch.schema || dataset.schema, patch.extensions || dataset.extensions)
    extendedSchemaForConstraints = extendedSchema
  } else if (patch.schema || ('attachmentsAsImage' in patch && patch.attachmentsAsImage !== dataset.attachmentsAsImage)) {
    patch.schema = await schemaUtils.extendedSchema(db, { ...dataset, ...patch })
    extendedSchemaForConstraints = patch.schema
  }
  // `constraints: null` was already normalized to `[]` above, so `'constraints' in patch` reliably
  // means "the request expresses an intent about constraints" (set some, or remove them all) as
  // opposed to "no opinion, keep whatever the dataset already has".
  const effectiveConstraints = 'constraints' in patch ? patch.constraints : dataset.constraints
  if (('constraints' in patch || patch.schema) && effectiveConstraints?.length) {
    extendedSchemaForConstraints ??= await schemaUtils.extendedSchema(db, { ...dataset, ...patch })
    // isVirtual/isMetaOnly are not patchable (absent from patchKeys), so dataset.isVirtual /
    // dataset.isMetaOnly always reflect the actual (immutable) type of the dataset being patched.
    checkConstraints(extendedSchemaForConstraints, effectiveConstraints, dataset)
  }
  if (patch.schema) {
    await schemaUtils.fixConcepts(dataset, patch.schema)
  }

  const removedRestProps = (dataset.isRest && patch.schema && dataset.schema.filter((df: any) => !df['x-calculated'] && !patch.schema.find((f: any) => f.key === df.key))) ?? []
  if (dataset.isRest && dataset.rest?.storeUpdatedBy && patch.rest && !patch.rest.storeUpdatedBy) {
    removedRestProps.push({ key: '_updatedBy' })
    removedRestProps.push({ key: '_updatedByName' })
  }

  // Re-publish publications (for catalogs in datafair)
  if (!patch.publications && dataset.publications && dataset.publications.length) {
    for (const p of dataset.publications) {
      if (p.status !== 'deleted') p.status = 'waiting'
    }
    patch.publications = dataset.publications
  }

  // Re-publish publications (with catalogs service)
  catalogsPublicationQueue.updatePublication(dataset.id)

  if (patch.rest) {
    // be extra sure that primaryKeyMode is preserved
    patch.rest.primaryKeyMode = patch.rest.primaryKeyMode || dataset.rest.primaryKeyMode
    if (patch.rest.primaryKeyMode !== dataset.rest.primaryKeyMode) {
      throw httpError(400, 'Impossible de changer le mode de clé primaire')
    }
  }

  if (patch.readApiKey && (patch.readApiKey.active !== dataset.readApiKey?.active || patch.readApiKey?.interval !== dataset.readApiKey?.interval)) {
    patch._readApiKey = datasetUtils.createReadApiKey(dataset.owner, patch.readApiKey)
  }
  if (patch.readApiKey === null) {
    patch._readApiKey = null
  }

  const coordXProp = dataset.schema.find((p: any) => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordX')
  const coordYProp = dataset.schema.find((p: any) => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordY')
  const projectGeomProp = dataset.schema.find((p: any) => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#Geometry')

  const digitalDocumentKey = (schema: any[]): string | undefined => schema?.find((f: any) => f['x-refersTo'] === 'http://schema.org/DigitalDocument')?.key

  let attemptMappingUpdate = false

  const reindexerStatus = dataset.file ? 'validated' : 'analyzed'

  if (datasetFile || attachmentsFile) {
    patch.dataUpdatedBy = patch.updatedBy
    patch.dataUpdatedAt = patch.updatedAt
    patch.status = 'loaded'
    patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant', validationMode: draftValidationMode }
  } else if (dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema({ ...dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.extensions && !dataset.isRest) {
    // extensions have changed, trigger full re-indexing
    // in "rest" dataset no need for full reindexing if the schema is still compatible, extension-updater worker will suffice
    patch.status = reindexerStatus
    for (const e of patch.extensions) delete e.needsUpdate
  } else if (patch.projection && (!dataset.projection || patch.projection.code !== dataset.projection.code) && ((coordXProp && coordYProp) || projectGeomProp)) {
    // geo projection has changed, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(dataset.schema)) {
    // geo concepts haved changed, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && digitalDocumentKey(patch.schema) !== digitalDocumentKey(dataset.schema)) {
    // digitalDocument concept changed: full re-indexing to (re)compute _attachment_url per row (a mapping update would leave it empty)
    patch.status = reindexerStatus
  } else if (patch.schema && patch.schema.find((f: any) => dataset.schema.find((df: any) => df.key === f.key && df.separator !== f.separator))) {
    // some separator has changed on a field, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && patch.schema.find((f: any) => dataset.schema.find((df: any) => df.key === f.key && df.timeZone !== f.timeZone))) {
    // some timeZone has changed on a field, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && patch.schema.find((f: any) => dataset.schema.find((df: any) => df.key === f.key && !equal(df['x-capabilities'], f['x-capabilities'])))) {
    // x-capabilities changes affect ES analyzers/normalizers and require full re-indexing
    patch.status = reindexerStatus
  } else if (removedRestProps.length) {
    patch.status = 'analyzed'
  } else if (dataset.file && patch.schema && datasetUtils.schemasTransformChange(patch.schema, dataset.schema)) {
    patch.status = 'analyzed'
  } else if (dataset.file && patch.schema && ['validation-updated', 'finalized'].includes(dataset.status) && datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true) && datasetUtils.schemaHasValidationRules(patch.schema) && !datasetUtils.schemasValidationCompatible(patch.schema, dataset.schema)) {
    patch.status = 'validation-updated'
  } else if (patch.schema && !datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true)) {
    attemptMappingUpdate = true
    patch.status = 'analyzed'
  } else if (patch.thumbnails || patch.masterData) {
    // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
    patch.finalizedAt = (new Date()).toISOString()
  } else if (patch.rest && dataset.rest && patch.rest.storeUpdatedBy !== dataset.rest.storeUpdatedBy) {
    // changes in rest history mode will be processed by the finalizer worker
    patch.status = 'analyzed'
  } else if (patch.rest) {
    // changes in rest history mode will be processed by the finalizer worker
    patch.status = 'indexed'
  }

  if (dataset.file && 'constraints' in patch) {
    // unique constraints changed (added, removed or dropped to null/[]): make sure the
    // index-lines unicity gate re-runs, no matter what the chain above decided. Applied
    // as a floor AFTER the chain (rather than as a chain member) so that a combined patch
    // (e.g. structure tab saving a schema transform/validation-rule change together with a
    // constraint change) doesn't lose the other status trigger to first-match-wins ordering.
    //
    // Statuses that already reach batch-processor/index-lines.ts (the unicity gate) on their
    // own, directly or via the file pipeline (storeFile -> normalizeFile -> analyzeCsv/Geojson
    // -> validateFile -> indexLines, see tasks.ts): 'loaded' (full file reprocessing), 'stored'
    // and 'normalized' (set by the error-retry branch above when the previous run failed at the
    // store/normalize step, see tasks.ts:102-103,144-145), and 'analyzed'/'validated'
    // (reindexerStatus for file datasets). Those are left as-is.
    //
    // 'validation-updated' is the one exception: process-file.ts finalizes it directly
    // (dataset.status === 'validation-updated' ? 'finalized' : 'validated', see
    // process-file.ts:103) without ever going through index-lines, so it must be escalated
    // to 'analyzed' — this re-runs both the validation rules and the constraint gate.
    //
    // Anything else (including no status change at all, e.g. a constraints-only patch that
    // matched no earlier branch) doesn't reach the gate either and gets the reindexerStatus
    // floor ('validated' for file datasets).
    const reachesUnicityGate = ['loaded', 'stored', 'normalized', 'analyzed', 'validated']
    if (patch.status === 'validation-updated') {
      patch.status = 'analyzed'
    } else if (!patch.status || !reachesUnicityGate.includes(patch.status)) {
      patch.status = reindexerStatus
    }
  }

  return { removedRestProps, attemptMappingUpdate }
}
