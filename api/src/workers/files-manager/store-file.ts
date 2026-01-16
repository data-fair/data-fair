import fs from 'fs-extra'
import * as datasetUtils from '../../datasets/utils/index.js'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetsService from '../../datasets/service.js'
import { replaceAllAttachments } from '../../datasets/utils/attachments.ts'
import chardet from 'chardet'
import JSONStream from 'JSONStream'
import { Transform } from 'node:stream'
import split2 from 'split2'
import pump from '../../misc/utils/pipe.ts'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import filesStorage from '#files-storage'
import tmp from 'tmp-promise'

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:file-storer:${dataset.id}`)

  const patch: Partial<DatasetInternal> = { loaded: null, status: 'stored' }
  const draft = !!dataset.draftReason
  const loadingDir = datasetUtils.loadingDir(dataset)

  const datasetFull = await mongo.db.collection('datasets').findOne({ id: dataset.id })

  const datasetFile = dataset.loaded?.dataset
  if (datasetFile) {
    const loadedFilePath = datasetUtils.loadedFilePath(dataset)

    if (!await filesStorage.pathExists(loadedFilePath)) {
      // we should not have to do this
      // this is a weird thing, maybe an unsolved race condition ?
      // let's wait a bit and try again to mask this problem temporarily
      internalError('storer-missing-file', 'file missing when storer started working ' + loadedFilePath)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    // manage some special cases of invalid files
    // some ESRI files have invalid geojson with stuff like this:
    // "GLOBALID": {7E1C9E26-9767-4AE4-9CBB-F353B15B3BFE},
    if (dataset.extras?.fixGeojsonGlobalId || dataset.extras?.fixGeojsonESRI) {
      const fixedFile = await tmp.file()
      // creating empty file before streaming seems to fix some weird bugs with NFS
      await fs.ensureFile(fixedFile.path)
      const globalIdRegexp = /"GLOBALID": \{(.*)\}/g
      await pump(
        (await filesStorage.readStream(loadedFilePath)).body,
        split2(),
        new Transform({
          objectMode: true,
          transform (line, encoding, callback) {
            const match = globalIdRegexp.exec(line)
            if (match) {
              callback(null, line.replace(match[0], `"GLOBALID": "${match[1]}"`))
            } else {
              callback(null, line)
            }
          }
        }),
        JSONStream.parse('features.*'),
        // transform geojson features into raw data items
        new Transform({
          objectMode: true,
          transform (feature, encoding, callback) {
            if (feature.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates) && Array.isArray(feature.geometry.coordinates[0]) && Array.isArray(feature.geometry.coordinates[0][0])) {
              feature.geometry.type = 'MultiLineString'
            }
            callback(null, feature)
          }
        }),
        JSONStream.stringify(`{
 "type": "FeatureCollection",
 "features": [`, ',\n  ', ` ]
}`),
        fs.createWriteStream(fixedFile.path)
      )
      await filesStorage.moveFromFs(fixedFile.path, loadedFilePath)
    }

    if (datasetFile.explicitEncoding) {
      debug(`Explicit encoding ${datasetFile.encoding} for file ${loadedFilePath}`)
      datasetFile.encoding = datasetFile.explicitEncoding
    } else {
      const fileSample = await filesStorage.fileSample(loadedFilePath)
      debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${loadedFilePath}`)
      const encoding = chardet.detect(fileSample)
      if (encoding) datasetFile.encoding = encoding
      debug(`Detected encoding ${datasetFile.encoding} for file ${loadedFilePath}`)
    }

    patch.originalFile = datasetFile
    if (datasetUtils.basicTypes.includes(datasetFile.mimetype)) {
      patch.file = { ...patch.originalFile, schema: [] }
    }

    const newFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    await filesStorage.moveFile(loadedFilePath, newFilePath)

    if (dataset.originalFile) {
      const oldFilePath = datasetUtils.originalFilePath(dataset)
      if (oldFilePath !== newFilePath) {
        await filesStorage.removeFile(oldFilePath)
      }
    }
  } else if (draft && !await filesStorage.pathExists(datasetUtils.originalFilePath(dataset))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await filesStorage.copyFile(datasetUtils.originalFilePath(datasetFull), datasetUtils.originalFilePath(dataset))
  }

  if (dataset.loaded?.attachments) {
    await replaceAllAttachments(dataset, datasetUtils.loadedAttachmentsFilePath(dataset))
  } else if (draft && await filesStorage.pathExists(datasetUtils.attachmentsDir(datasetFull)) && !await filesStorage.pathExists(datasetUtils.attachmentsDir(dataset))) {
    // this happens if we upload only the main data file and not the attachments
    // in this case copy the attachments directory from prod
    await filesStorage.copyDir(datasetUtils.attachmentsDir(datasetFull), datasetUtils.attachmentsDir(dataset))
  }

  await filesStorage.removeDir(loadingDir)

  await datasetsService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset)
  debug('done')
}
