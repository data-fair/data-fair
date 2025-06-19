import fs from 'fs-extra'
import path from 'path'
import { Readable, Transform } from 'stream'
import pump from '../misc/utils/pipe.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import * as datasetUtils from '../datasets/utils/index.js'
import { updateStorage } from '../datasets/utils/storage.ts'
import * as datasetsService from '../datasets/service.js'
import { getPseudoSessionState } from '../misc/utils/users.js'
import * as permissionsUtils from '../misc/utils/permissions.ts'
import { lsMetadataAttachments, metadataAttachmentPath, lsAttachments, attachmentPath } from '../datasets/utils/files.ts'
import { applyTransactions } from '../datasets/utils/rest.ts'
import iterHits from '../datasets/es/iter-hits.js'
import taskProgress from '../datasets/utils/task-progress.ts'
import * as filesUtils from '../datasets/utils/files.ts'
import * as virtualDatasetsUtils from '../datasets/utils/virtual.ts'

import debugLib from 'debug'
import mongo from '#mongo'
import { getFlattenNoCache } from '../datasets/utils/flatten.ts'

export const eventsPrefix = 'initialize'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:initializer:${dataset.id}`)
  const db = mongo.db

  /** @type {any} */
  const patch = { updatedAt: (new Date()).toISOString() }
  if (dataset.isRest) {
    patch.status = 'analyzed'
  } else if (dataset.remoteFile) {
    patch.status = 'imported'
  } else if (dataset.isVirtual) {
    patch.status = 'indexed'
  } else if (dataset.loaded) {
    patch.status = 'loaded'
  }

  if (dataset.isRest) {
    await restUtils.initDataset(dataset)
  }

  if (dataset.initFrom) {
    const pseudoSessionState = getPseudoSessionState(dataset.owner, 'initializer', '_init_from', dataset.initFrom.role, dataset.initFrom.department)
    const parentDataset = await db.collection('datasets').findOne({ id: dataset.initFrom.dataset })
    if (!parentDataset) throw new Error('[noretry] jeu de données d\'initialisation inconnu ' + dataset.initFrom.dataset)
    const parentDatasetPermissions = permissionsUtils.list('datasets', parentDataset, pseudoSessionState)
    if (!parentDatasetPermissions.includes('readDescription')) {
      throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
    }
    const hasAttachments = parentDataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')

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

      if (hasAttachments && !parentDatasetPermissions.includes('downloadAttachment')) {
        throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
      }
      if (hasAttachments) {
        count += attachments.length
        if (!parentDataset.isVirtual) {
          attachments = await lsAttachments(parentDataset)
        }
      }
    }

    if (dataset.initFrom.parts.includes('metadataAttachments')) {
      if (!parentDatasetPermissions.includes('downloadMetadataAttachment')) {
        throw new Error(`[noretry] permission manquante sur le jeu de données d'initialisation "${parentDataset.slug}" (${parentDataset.id})`)
      }
      metadataAttachments = await lsMetadataAttachments(parentDataset)
      count += metadataAttachments.length
    }

    const progress = taskProgress(dataset.id, eventsPrefix, count)

    if (dataset.initFrom.parts.includes('schema')) {
      if (dataset.initFrom.parts.includes('extensions')) {
        patch.schema = parentDataset.schema.filter(p => !p['x-calculated'] || p['x-extension'])
      } else {
        patch.schema = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension'])
      }
      patch.schema = patch.schema.map(p => {
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

    if (dataset.initFrom.parts.includes('data')) {
      const flatten = getFlattenNoCache(parentDataset)
      if (parentDataset.isVirtual) {
        parentDataset.descendantsFull = await virtualDatasetsUtils.descendants(parentDataset, false, ['owner'])
        parentDataset.descendants = parentDataset.descendantsFull.map(d => d.id)
      }
      if (dataset.isRest) {
        // from any kind of dataset to rest: copy data in bulk into the mongodb collection
        const select = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => p.key)
        if (hasAttachments && parentDataset.isVirtual) select.push('_attachment_url')
        for await (const hits of iterHits(app.get('es'), parentDataset, { size: 1000, select: select.join(',') })) {
          if (hasAttachments && parentDataset.isVirtual) {
            for (const hit of hits) {
              if (hit._source._attachment_url) {
                attachments.push(hit._source._attachment_url)
                delete hit._source._attachment_url
              }
            }
          }
          const transactions = hits.map(hit => ({ _action: 'create', _id: hit._id, ...flatten(hit._source) }))
          await applyTransactions(dataset, pseudoSessionState.user, transactions)
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
        await progress.inc(parentDataset.count)
      } else {
        // from rest or virtual to file: make export and use as data file

        const fileName = parentDataset.slug + '.csv'
        const filePath = path.join(datasetUtils.loadingDir(dataset), fileName)

        // creating empty file before streaming seems to fix some weird bugs with NFS
        await fs.ensureFile(filePath)

        let inputStreams
        if (parentDataset.isRest) inputStreams = await restUtils.readStreams(parentDataset)
        else if (parentDataset.isVirtual) {
          const select = parentDataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']).map(p => p.key)
          if (hasAttachments && parentDataset.isVirtual) select.push('_attachment_url')
          const iter = iterHits(app.get('es'), parentDataset, { size: 1000, select: select.join(',') })
          inputStreams = [
            Readable.from(iter),
            new Transform({
              objectMode: true,
              transform (hits, encoding, callback) {
                for (const hit of hits) {
                  if (hasAttachments && parentDataset.isVirtual && hit._source._attachment_url) {
                    attachments.push(hit._source._attachment_url)
                    delete hit._source._attachment_url
                  }
                  this.push(flatten(hit._source))
                }
                callback()
              }
            })
          ]
        }

        await pump(
          ...inputStreams,
          new Transform({
            objectMode: true,
            async transform (item, encoding, callback) {
              try {
                await progress.inc()
                this.push(item)
                callback()
              } catch (err) {
                callback(err)
              }
            }
          }),
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
    }

    // also copy attachments
    if (attachments.length) {
      for (const attachment of attachments) {
        let relPath = attachment
        let copyPath = attachmentPath(parentDataset, attachment)
        if (parentDataset.isVirtual) {
          const pathParts = new URL(attachment).pathname.split('/')
          const descendant = parentDataset.descendantsFull.find(d => d.id === pathParts[5])
          if (!descendant) continue
          relPath = pathParts.slice(7).join('/')
          copyPath = attachmentPath(descendant, relPath)
        }
        const newPath = attachmentPath(dataset, relPath)
        await fs.ensureDir(path.dirname(newPath))
        await fs.copyFile(copyPath, newPath)
        await progress.inc()
      }
    }

    if (dataset.draftReason) {
      const datasetFull = await mongo.db.collection('datasets').findOne({ id: dataset.id })
      const datasetFullPatch = { initFrom: null }
      // we apply schema not only to the draft but also to the main dataset info so that file validation rules apply correctly
      if (patch.schema) datasetFullPatch.schema = patch.schema
      await datasetsService.applyPatch(app, datasetFull, datasetFullPatch)
    } else {
      patch.initFrom = null
    }
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset)
  debug('done')
}
