const path = require('path')
const config = /** @type {any} */(require('config'))
const slug = require('slugify')
const CronJob = require('cron').CronJob
const locks = require('../../misc/utils/locks')
const metrics = require('../../misc/utils/metrics')
const nanoid = require('../../misc/utils/nanoid')
const visibilityUtils = require('../../misc/utils/visibility')
const { prepareThumbnailUrl } = require('../../misc/utils/thumbnails')
const { prepareMarkdownContent } = require('../../misc/utils/markdown')
const permissions = require('../../misc/utils/permissions')
const findUtils = require('../../misc/utils/find')
const filesUtils = require('./files')
const storageUtils = require('./storage')
const dataStreamsUtils = require('./data-streams')
const schemaUtils = require('./schema')
const readApiKeyUtils = require('./read-api-key')

exports.filePath = filesUtils.filePath
exports.dataFiles = filesUtils.dataFiles
exports.lsFiles = filesUtils.lsFiles
exports.lsAttachments = filesUtils.lsAttachments
exports.fullFilePath = filesUtils.fullFilePath
exports.originalFilePath = filesUtils.originalFilePath
exports.attachmentsDir = filesUtils.attachmentsDir
exports.metadataAttachmentsDir = filesUtils.metadataAttachmentsDir
exports.dir = filesUtils.dir
exports.fullFilePath = filesUtils.fullFilePath
exports.fullFileName = filesUtils.fullFileName
exports.exportedFilePath = filesUtils.exportedFilePath
exports.loadedFilePath = filesUtils.loadedFilePath
exports.loadingDir = filesUtils.loadingDir
exports.loadedAttachmentsFilePath = filesUtils.loadedAttachmentsFilePath
exports.attachmentPath = filesUtils.attachmentPath
exports.metadataAttachmentPath = filesUtils.metadataAttachmentPath

exports.mergeFileSchema = schemaUtils.mergeFileSchema
exports.cleanSchema = schemaUtils.cleanSchema
exports.extendedSchema = schemaUtils.extendedSchema
exports.schemasFullyCompatible = schemaUtils.schemasFullyCompatible
exports.schemasValidationCompatible = schemaUtils.schemasValidationCompatible
exports.schemaHasValidationRules = schemaUtils.schemaHasValidationRules
exports.jsonSchema = schemaUtils.jsonSchema
exports.createReadApiKey = readApiKeyUtils.create

exports.mergeDraft = require('./merge-draft')

exports.updateStorage = storageUtils.updateStorage

exports.sampleValues = dataStreamsUtils.sampleValues
exports.readStreams = dataStreamsUtils.readStreams

exports.reindex = async (db, dataset) => {
  let patch = { status: 'stored' }
  if (dataset.isVirtual) patch.status = 'indexed'
  else if (dataset.isRest) patch.status = 'analyzed'
  if (dataset.draftReason) patch = { 'draft.status': patch.status }
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnDocument: 'after' })).value
}

exports.refinalize = async (db, dataset) => {
  let patch = { status: 'indexed' }
  if (dataset.draftReason) patch = { 'draft.status': patch.status }
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnDocument: 'after' })).value
}

// Generate ids and try insertion until there is no conflict on id
exports.insertWithId = async (db, dataset, onClose) => {
  const baseSlug = slug(dataset.title, { lower: true, strict: true })
  const owner = dataset.owner
  dataset.id = dataset.id ?? nanoid()
  dataset.slug = baseSlug
  exports.setUniqueRefs(dataset)
  let insertOk = false
  let i = 1
  while (!insertOk) {
    const idLockKey = `dataset:${dataset.id}`
    const idAck = locks.acquire(db, idLockKey, 'insertWithBaseid')
    if (!idAck) throw new Error(`dataset id ${dataset.id} is locked`)
    if (onClose) {
      onClose(() => {
        // console.log('releasing dataset lock on id', idLockKey)
        locks.release(db, idLockKey).catch(err => {
          metrics.internalError('dataset-lock-id', err)
        })
      })
    }

    const slugLockKey = `dataset:slug:${owner.type}:${owner.id}:${dataset.slug}`
    const slugAck = locks.acquire(db, slugLockKey, 'insertWithBaseid')
    if (slugAck) {
      try {
        await db.collection('datasets').insertOne(dataset)
        insertOk = true
        if (onClose) {
          onClose(() => {
            // console.log('releasing dataset lock on slug', slugLockKey)
            locks.release(db, slugLockKey).catch(err => {
              metrics.internalError('dataset-lock-slug', err)
            })
          })
        } else {
          await locks.release(db, idLockKey)
          await locks.release(db, slugLockKey)
        }
        break
      } catch (err) {
        await locks.release(db, slugLockKey)
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
    exports.setUniqueRefs(dataset)
  }
  return dataset
}

exports.previews = (dataset, publicUrl = config.publicUrl) => {
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

exports.clean = (publicUrl, publicationSite, dataset, query = {}, draft = false) => {
  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    const thumbnail = query.thumbnail || '300x200'
    if (draft) exports.mergeDraft(dataset)
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
      dataset.previews = exports.previews(dataset, publicUrl)
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

exports.setUniqueRefs = (resource) => {
  if (resource.slug) {
    resource._uniqueRefs = [resource.id]
    if (resource.slug !== resource.id) resource._uniqueRefs.push(resource.slug)
  }
}

exports.curateDataset = (dataset, existingDataset) => {
  if (dataset.title) dataset.title = dataset.title.trim()

  if (dataset.remoteFile?.autoUpdate?.active) {
    const job = new CronJob(config.remoteFilesAutoUpdates.cron, () => {})
    dataset.remoteFile.autoUpdate.nextUpdate = job.nextDates().toISOString()
  } else if (dataset.remoteFile?.autoUpdate) {
    delete dataset.remoteFile.autoUpdate.nextUpdate
  }

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

exports.titleFromFileName = (name) => {
  let baseFileName = path.parse(name).name
  if (baseFileName.endsWith('.gz')) baseFileName = path.parse(baseFileName).name
  return path.parse(baseFileName).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
}
