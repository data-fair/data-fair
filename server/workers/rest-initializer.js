exports.eventsPrefix = 'initialize'

exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const path = require('path')
  const restUtils = require('../datasets/utils/rest')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { getPseudoUser } = require('../misc/utils/users')
  const permissionsUtils = require('../misc/utils/permissions')
  const { lsMetadataAttachments, metadataAttachmentsDir, lsAttachments, attachmentsDir } = require('../datasets/utils/files')
  const { applyTransactions } = require('../datasets/utils/rest')
  const iterHits = require('../datasets/es/iter-hits')
  const taskProgress = require('../datasets/utils/task-progress')

  const debug = require('debug')(`worker:rest-initializer:${dataset.id}`)
  const db = app.get('db')

  /** @type {any} */
  const patch = { status: 'analyzed', updatedAt: (new Date()).toISOString() }

  await restUtils.initDataset(db, dataset)

  if (dataset.initFrom) {
    const pseudoUser = getPseudoUser(dataset.owner, 'initializer', '_init_from', dataset.initFrom.role)
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
        const dir = attachmentsDir(dataset)
        await fs.ensureDir(dir)
        for (const attachment of attachments) {
          await fs.copyFile(path.join(attachmentsDir(parentDataset), attachment), path.join(dir, attachment))
          await progress()
        }
      }
    }

    if (dataset.initFrom.parts.includes('schema')) {
      patch.schema = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => {
        const newProperty = { ...p }
        delete newProperty.enum
        delete newProperty['x-cardinality']
        return newProperty
      })
    }
    if (dataset.initFrom.parts.includes('extensions')) {
      patch.extensions = parentDataset.extensions
    }
    if (dataset.initFrom.parts.includes('primaryKey')) {
      patch.primaryKey = parentDataset.primaryKey
    }
    if (dataset.initFrom.parts.includes('description')) {
      patch.description = parentDataset.description
    }
    if (dataset.initFrom.parts.includes('metadataAttachments')) {
      const dir = metadataAttachmentsDir(dataset)
      await fs.ensureDir(dir)
      for (const metadataAttachment of metadataAttachments) {
        await fs.copyFile(path.join(metadataAttachmentsDir(parentDataset), metadataAttachment), path.join(dir, metadataAttachment))
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
