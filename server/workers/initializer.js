import fs from 'fs-extra'
import path from 'path'
import pump from '../misc/utils/pipe.js'
import * as restUtils from '../datasets/utils/rest.js'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetsService from '../datasets/service.js'
import { getPseudoUser } from '../misc/utils/users.js'
import * as permissionsUtils from '../misc/utils/permissions.js'
import { lsMetadataAttachments, metadataAttachmentPath, lsAttachments, attachmentPath } from '../datasets/utils/files.js'
import { applyTransactions } from '../datasets/utils/rest.js'
import iterHits from '../datasets/es/iter-hits.js'
import taskProgress from '../datasets/utils/task-progress.js'
import * as filesUtils from '../datasets/utils/files.js'
import debugLib from 'debug'

export const eventsPrefix = 'initialize'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:initializer:${dataset.id}`)
  const db = app.get('db')

  /** @type {any} */
  const patch = { updatedAt: (new Date()).toISOString() }
  if (dataset.isRest) {
    patch.status = 'analyzed'
  } else if (dataset.remoteFile) {
    patch.status = 'imported'
  } else if (dataset.loaded) {
    patch.status = 'loaded'
  }

  if (dataset.isRest) {
    await restUtils.initDataset(db, dataset)
  }

  if (dataset.initFrom) {
    const pseudoUser = getPseudoUser(dataset.owner, 'initializer', '_init_from', dataset.initFrom.role, dataset.initFrom.department)
    const parentDataset = await db.collection('datasets').findOne({ id: dataset.initFrom.dataset })
    if (!parentDataset) throw new Error('[noretry] jeu de données d\'initialisation inconnu ' + dataset.initFrom.dataset)
    const parentDatasetPermissions = permissionsUtils.list('datasets', parentDataset, pseudoUser)
    if (!parentDatasetPermissions.includes('readDescription')) {
      throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
    }

    let count = 0
    /** @type {any[]} */
    let attachments = []
    /** @type {any[]} */
    let metadataAttachments = []

    if (dataset.initFrom.parts.includes('data')) {
      if (!parentDatasetPermissions.includes('readLines')) {
        throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
      }
      count += parentDataset.count

      // also copy attachments
      attachments = await lsAttachments(parentDataset)
      if (attachments.length) {
        if (!parentDatasetPermissions.includes('downloadAttachment')) {
          throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
        }
      }
      count += attachments.length
    }

    if (dataset.initFrom.parts.includes('metadataAttachments')) {
      if (!parentDatasetPermissions.includes('downloadMetadataAttachment')) {
        throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
      }
      metadataAttachments = await lsMetadataAttachments(parentDataset)
      count += metadataAttachments.length
    }

    const progress = taskProgress(app, dataset.id, eventsPrefix, count)

    if (dataset.initFrom.parts.includes('schema')) {
      patch.schema = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => {
        const newProperty = { ...p }
        delete newProperty.enum
        delete newProperty['x-cardinality']
        const fileProp = parentDataset.file?.schema?.find(fp => fp.key === p.key)
        if (fileProp && dataset.isRest) {
          if (fileProp.dateFormat) newProperty.dateFormat = fileProp.dateFormat
          if (fileProp.dateTimeFormat) newProperty.dateTimeFormat = fileProp.dateTimeFormat
        }
        return newProperty
      })

      // a few extra properties implicitly accompany the schema
      if (parentDataset.primaryKey?.length) patch.primaryKey = parentDataset.primaryKey
      if (parentDataset.attachmentsAsImage) patch.attachmentsAsImage = parentDataset.attachmentsAsImage
      if (parentDataset.timeZone) patch.timeZone = parentDataset.timeZone
      if (parentDataset.projection) patch.projection = parentDataset.projection
    }

    if (dataset.initFrom.parts.includes('data')) {
      if (dataset.isRest) {
        // from any kind of dataset to rest: copy data in bulk into the mongodb collection
        const select = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => p.key).join(',')
        for await (const hits of iterHits(app.get('es'), parentDataset, { size: 1000, select })) {
          const transactions = hits.map(hit => ({ _action: 'create', _id: hit._id, ...hit._source }))
          await applyTransactions(db, dataset, pseudoUser, transactions)
          await progress.inc(transactions.length)
        }
      } else if (parentDataset.file) {
        // from file to file: copy data files
        patch.file = parentDataset.file
        patch.originalFile = parentDataset.originalFile
        patch.status = 'analyzed'
        await fs.copy(datasetUtils.originalFilePath(parentDataset), datasetUtils.originalFilePath({ ...dataset, ...patch }))
        if (datasetUtils.originalFilePath(parentDataset) !== datasetUtils.filePath(parentDataset)) {
          await fs.copy(datasetUtils.filePath(parentDataset), datasetUtils.filePath({ ...dataset, ...patch }))
        }
      } else {
        // from rest to file: make export and use as data file

        const fileName = parentDataset.slug + '.csv'
        const filePath = path.join(datasetUtils.loadingDir(dataset), fileName)

        // creating empty file before streaming seems to fix some weird bugs with NFS
        await fs.ensureFile(filePath)
        await pump(
          ...await restUtils.readStreams(db, parentDataset),
          ...(await import('../datasets/utils/outputs.js')).csvStreams({ ...dataset, ...patch }),
          fs.createWriteStream(filePath)
        )
        await filesUtils.fsyncFile(filePath)
        const loadedFileStats = await fs.stat(filePath)

        patch.status = 'loaded'
        patch.loaded = {
          dataset: {
            name: fileName,
            size: loadedFileStats.size,
            mimetype: 'text/csv'
          }
        }
      }

      // also copy attachments
      if (attachments.length) {
        for (const attachment of attachments) {
          const newPath = attachmentPath(dataset, attachment)
          await fs.ensureDir(path.dirname(newPath))
          await fs.copyFile(attachmentPath(parentDataset, attachment), newPath)
          await progress.inc()
        }
      }
    }

    if (dataset.initFrom.parts.includes('extensions')) {
      patch.extensions = parentDataset.extensions
    }
    if (dataset.initFrom.parts.includes('description')) {
      patch.description = parentDataset.description
    }
    if (dataset.initFrom.parts.includes('metadataAttachments')) {
      for (const metadataAttachment of metadataAttachments) {
        const newPath = metadataAttachmentPath(dataset, metadataAttachment)
        await fs.ensureDir(path.dirname(newPath))
        await fs.copyFile(metadataAttachmentPath(parentDataset, metadataAttachment), newPath)
        await progress.inc()
      }
      patch.attachments = parentDataset.attachments
    }

    if (dataset.draftReason) {
      const datasetFull = await app.get('db').collection('datasets').findOne({ id: dataset.id })
      const datasetFullPatch = { initFrom: null }
      // we apply schema not only to the draft but also to the main dataset info so that file validation rules apply correctly
      if (patch.schema) datasetFullPatch.schema = patch.schema
      await datasetsService.applyPatch(app, datasetFull, datasetFullPatch)
    } else {
      patch.initFrom = null
    }
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
