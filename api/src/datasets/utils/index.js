import path from 'path'
import config from '#config'
import slug from 'slugify'
import locks from '@data-fair/lib-node/locks.js'
import nanoid from '../../misc/utils/nanoid.js'
import * as visibilityUtils from '../../misc/utils/visibility.js'
import { prepareThumbnailUrl } from '../../misc/utils/thumbnails.js'
import { prepareMarkdownContent } from '../../misc/utils/markdown.js'
import * as permissions from '../../misc/utils/permissions.ts'
import * as findUtils from '../../misc/utils/find.js'
import * as filesUtils from './files.ts'
import * as schemaUtils from './data-schema.ts'
import * as readApiKeyUtils from './read-api-key.js'
import mergeDraft from './merge-draft.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { reqSession } from '@data-fair/lib-express'

export { default as mergeDraft } from './merge-draft.js'
export * from './types.js'

export const filePath = filesUtils.filePath
export const dataFiles = filesUtils.dataFiles
export const lsFiles = filesUtils.lsFiles
export const lsAttachments = filesUtils.lsAttachments
export const fullFilePath = filesUtils.fullFilePath
export const originalFilePath = filesUtils.originalFilePath
export const attachmentsDir = filesUtils.attachmentsDir
export const metadataAttachmentsDir = filesUtils.metadataAttachmentsDir
export const dir = filesUtils.dir
export const fullFileName = filesUtils.fullFileName
export const exportedFilePath = filesUtils.exportedFilePath
export const loadedFilePath = filesUtils.loadedFilePath
export const loadingDir = filesUtils.loadingDir
export const loadedAttachmentsFilePath = filesUtils.loadedAttachmentsFilePath
export const attachmentPath = filesUtils.attachmentPath
export const metadataAttachmentPath = filesUtils.metadataAttachmentPath

export const mergeFileSchema = schemaUtils.mergeFileSchema
export const cleanSchema = schemaUtils.cleanSchema
export const extendedSchema = schemaUtils.extendedSchema
export const schemasFullyCompatible = schemaUtils.schemasFullyCompatible
export const schemasValidationCompatible = schemaUtils.schemasValidationCompatible
export const schemaHasValidationRules = schemaUtils.schemaHasValidationRules
export const schemasTransformChange = schemaUtils.schemasTransformChange
export const jsonSchema = schemaUtils.jsonSchema
export const createReadApiKey = readApiKeyUtils.create

export const reindex = async (db, dataset) => {
  let patch = { status: 'stored' }
  if (dataset.isVirtual) patch.status = 'indexed'
  else if (dataset.isRest) patch.status = 'analyzed'
  if (dataset.draftReason) patch = { 'draft.status': patch.status }
  return await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch, $unset: { _partialRestStatus: 1 } }, { returnDocument: 'after' })
}

export const refinalize = async (db, dataset) => {
  let patch = { status: 'indexed' }
  if (dataset.draftReason) patch = { 'draft.status': patch.status }
  return await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch, $unset: { _partialRestStatus: 1 } }, { returnDocument: 'after' })
}

// Generate ids and try insertion until there is no conflict on id
export const insertWithId = async (db, dataset, onClose) => {
  const baseSlug = dataset.slug || slug(dataset.title, { lower: true, strict: true })
  const owner = dataset.owner
  dataset.id = dataset.id ?? nanoid()
  dataset.slug = baseSlug
  setUniqueRefs(dataset)
  let insertOk = false
  let i = 1
  while (!insertOk) {
    const idLockKey = `datasets:${dataset.id}`
    const idAck = locks.acquire(idLockKey, 'insertWithBaseid')
    if (!idAck) throw new Error(`dataset id ${dataset.id} is locked`)
    if (onClose) {
      onClose(() => {
        // console.log('releasing dataset lock on id', idLockKey)
        locks.release(idLockKey).catch(err => {
          internalError('dataset-lock-id', err)
        })
      })
    }

    const slugLockKey = `datasets:slug:${owner.type}:${owner.id}:${dataset.slug}`
    const slugAck = locks.acquire(slugLockKey, 'insertWithBaseid')
    if (slugAck) {
      try {
        await db.collection('datasets').insertOne(dataset)
        insertOk = true
        if (onClose) {
          onClose(() => {
            // console.log('releasing dataset lock on slug', slugLockKey)
            locks.release(slugLockKey).catch(err => {
              internalError('dataset-lock-slug', err)
            })
          })
        } else {
          await locks.release(idLockKey)
          await locks.release(slugLockKey)
        }
        break
      } catch (err) {
        await locks.release(slugLockKey)
        if (err.code !== 11000) throw err
        if (err.keyValue) {
          if (err.keyValue.id) throw err
        } else {
          // on older mongo err.keyValue is not provided and we need to use the message
          if (err.message.includes('id_1')) throw err
        }
      }
    }
    i += 1
    dataset.slug = `${baseSlug}-${i}`
    setUniqueRefs(dataset)
  }
  return dataset
}

export const previews = (dataset, publicUrl = config.publicUrl) => {
  if (!dataset.schema) return []
  const datasetRef = publicUrl === config.publicUrl ? dataset.id : dataset.slug
  const previews = [{ id: 'table', title: 'Tableau', href: `${publicUrl}/embed/dataset/${datasetRef}/table` }]
  if (!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))) {
    previews.push({ id: 'calendar', title: 'Calendrier', href: `${publicUrl}/embed/dataset/${datasetRef}/calendar` })
  }
  if (dataset.bbox) {
    previews.push({ id: 'map', title: 'Carte', href: `${publicUrl}/embed/dataset/${datasetRef}/map` })
    previews.push({ id: 'map-bounds', title: 'Enveloppe géographique', href: `${publicUrl}/embed/dataset/${datasetRef}/map-bounds` })
  }
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty && (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false)) {
    previews.push({ id: 'search-files', title: 'Fichiers', href: `${publicUrl}/embed/dataset/${datasetRef}/search-files` })
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')) {
    previews.push({ id: 'thumbnails', title: 'Vignettes', href: `${publicUrl}/embed/dataset/${datasetRef}/thumbnails` })
  }
  return previews
}

/**
 * @param {import('express').Request} req
 * @param {any} dataset
 * @param {boolean} draft
 */
export const clean = (req, dataset, draft = false) => {
  const query = req.query
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicUrl = req.publicBaseUrl

  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    dataset.userPermissions = permissions.list('datasets', dataset, reqSession(req), req.bypassPermissions)
    const thumbnail = query.thumbnail || '300x200'
    if (draft) mergeDraft(dataset)
    if (!select.includes('-public')) dataset.public = permissions.isPublic('datasets', dataset)
    if (!select.includes('-visibility')) dataset.visibility = visibilityUtils.visibility(dataset)
    if (!query.select || select.includes('description')) {
      dataset.description = dataset.description || ''
      dataset.description = prepareMarkdownContent(dataset.description, query.html === 'true', query.truncate, 'dataset:' + dataset.id, dataset.updatedAt)
    }

    if (dataset.schema) {
      for (const field of dataset.schema) {
        field.description = field.description || ''
        field.description = prepareMarkdownContent(field.description, query.html === 'true', null, `dataset:${dataset.id}:${field.key}`, dataset.updatedAt)
      }
    }
    if (dataset.attachments) {
      for (let i = 0; i < dataset.attachments.length; i++) {
        const attachment = dataset.attachments[i]
        attachment.description = attachment.description || ''
        attachment.description = prepareMarkdownContent(attachment.description, query.html === 'true', null, `dataset:${dataset.id}:attachment-${i}`, dataset.updatedAt)
        if (attachment.type === 'file' || attachment.type === 'remoteFile') {
          attachment.url = `${publicUrl}/api/v1/datasets/${dataset.id}/metadata-attachments/${attachment.name}`
        }
      }
    }

    if (dataset.schema && !select.includes('-previews')) {
      dataset.previews = previews(dataset, publicUrl)
    }
    if (!select.includes('-links')) findUtils.setResourceLinks(dataset, 'dataset', publicUrl, publicationSite && publicationSite.datasetUrlTemplate)
    if (dataset.image && dataset.public && !select.includes('-thumbnail')) {
      dataset.thumbnail = prepareThumbnailUrl(publicUrl + '/api/v1/datasets/' + encodeURIComponent(dataset.id) + '/thumbnail', thumbnail)
    }
    if (dataset.image && publicUrl !== config.publicUrl) {
      dataset.image = dataset.image.replace(config.publicUrl, publicUrl)
    }
  }
  delete dataset.permissions
  delete dataset._id
  delete dataset._uniqueRefs
  delete dataset.initFrom
  delete dataset.loaded
  delete dataset._readApiKey
  delete dataset._attachmentsTargets
  delete dataset._partialRestStatus
  delete dataset._newRestAttachments

  if (select.includes('-userPermissions')) delete dataset.userPermissions
  if (select.includes('-owner')) delete dataset.owner

  if (publicationSite && dataset.extras?.applications?.length) {
    const siteKey = publicationSite.type + ':' + publicationSite.id
    dataset.extras.applications = dataset.extras.applications
      .filter(appRef => appRef.publicationSites && appRef.publicationSites.find(p => p === siteKey))
    for (const appRef of dataset.extras.applications) delete appRef.publicationSites
  }

  return dataset
}

export const setUniqueRefs = (resource) => {
  if (resource.slug) {
    resource._uniqueRefs = [resource.id]
    if (resource.slug !== resource.id) resource._uniqueRefs.push(resource.slug)
  }
}

export const curateDataset = (dataset, existingDataset) => {
  if (dataset.title) dataset.title = dataset.title.trim()

  if (dataset.masterData?.bulkSearchs?.length) {
    for (const bulkSearch of dataset.masterData.bulkSearchs) {
      if (!bulkSearch.id) bulkSearch.id = slug(bulkSearch.title, { lower: true, strict: true })
    }
  }
  if (dataset.masterData?.singleSearchs?.length) {
    for (const singleSearch of dataset.masterData.singleSearchs) {
      if (!singleSearch.id) singleSearch.id = slug(singleSearch.title, { lower: true, strict: true })
    }
  }
}

export const titleFromFileName = (name) => {
  let baseFileName = path.parse(name).name
  if (baseFileName.endsWith('.gz')) baseFileName = path.parse(baseFileName).name
  return path.parse(baseFileName).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
}
