exports.eventsPrefix = 'initialize'

exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const path = require('path')
  const restUtils = require('../datasets/utils/rest')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { getPseudoUser } = require('../misc/utils/users')
  const permissionsUtils = require('../misc/utils/permissions')
  const { lsMetadataAttachments, metadataAttachmentPath, lsAttachments, attachmentPath } = require('../datasets/utils/files')
  const { applyTransactions } = require('../datasets/utils/rest')
  const iterHits = require('../datasets/es/iter-hits')
  const taskProgress = require('../datasets/utils/task-progress')

  const debug = require('debug')(`worker:rest-initializer:${dataset.id}`)
  const db = app.get('db')

  /** @type {any} */
  const patch = { status: 'analyzed', updatedAt: (new Date()).toISOString() }

  await restUtils.initDataset(db, dataset)

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

    const progress = taskProgress(app, dataset.id, exports.eventsPrefix, count)

    if (dataset.initFrom.parts.includes('data')) {
      // copy data in bulk
      const select = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => p.key).join(',')
      for await (const hits of iterHits(app.get('es'), parentDataset, { size: 1000, select })) {
        const transactions = hits.map(hit => ({ _action: 'create', _id: hit._id, ...hit._source }))
        await applyTransactions(db, dataset, pseudoUser, transactions)
        await progress(transactions.length)
      }
      // also copy attachments
      if (attachments.length) {
        for (const attachment of attachments) {
          const newPath = attachmentPath(dataset, attachment)
          await fs.ensureDir(path.dirname(newPath))
          await fs.copyFile(attachmentPath(parentDataset, attachment), newPath)
          await progress()
        }
      }
    }

    if (dataset.initFrom.parts.includes('schema')) {
      patch.schema = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => {
        const newProperty = { ...p }
        delete newProperty.enum
        delete newProperty['x-cardinality']
        const fileProp = parentDataset.file?.schema?.find(fp => fp.key === p.key)
        if (fileProp) {
          if (fileProp.dateFormat) newProperty.dateFormat = fileProp.dateFormat
          if (fileProp.dateTimeFormat) newProperty.dateTimeFormat = fileProp.dateTimeFormat
        }
        return newProperty
      })

      // a few extra properties implicitly accompany the schema
      if (parentDataset.primaryKey?.length) patch.primaryKey = parentDataset.primaryKey
      if (parentDataset.attachmentsAsImage) patch.attachmentsAsImage = parentDataset.attachmentsAsImage
      if (parentDataset.timeZone) patch.timeZone = parentDataset.timeZone
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
        await progress()
      }
      patch.attachments = parentDataset.attachments
    }

    patch.initFrom = null
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
