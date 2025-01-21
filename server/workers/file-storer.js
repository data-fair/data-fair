import fs from 'fs-extra'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetsService from '../datasets/service.js'
import { replaceAllAttachments } from '../datasets/utils/attachments.js'
import datasetFileSample from '../datasets/utils/file-sample.js'
import chardet from 'chardet'
import md5File from 'md5-file'
import JSONStream from 'JSONStream'
import { Transform } from 'node:stream'
import split2 from 'split2'
import pump from '../misc/utils/pipe.js'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'

export const eventsPrefix = 'store'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:file-storer:${dataset.id}`)

  /** @type {any} */
  const patch = { loaded: null, status: 'stored' }
  const draft = !!dataset.draftReason
  const loadingDir = datasetUtils.loadingDir(dataset)

  const datasetFull = await app.get('db').collection('datasets').findOne({ id: dataset.id })

  const datasetFile = dataset.loaded?.dataset
  if (datasetFile) {
    const loadedFilePath = datasetUtils.loadedFilePath(dataset)

    if (!await fs.pathExists(loadedFilePath)) {
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
      const fixedFilePath = loadedFilePath + '.fixed'
      const globalIdRegexp = /"GLOBALID": \{(.*)\}/g
      await pump(
        fs.createReadStream(loadedFilePath),
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
        fs.createWriteStream(fixedFilePath)
      )
      await fs.move(fixedFilePath, loadedFilePath, { overwrite: true })
    }

    datasetFile.md5 = await md5File(loadedFilePath)
    const fileSample = await datasetFileSample(loadedFilePath)
    debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${loadedFilePath}`)
    datasetFile.encoding = chardet.detect(fileSample)
    debug(`Detected encoding ${datasetFile.encoding} for file ${loadedFilePath}`)

    patch.originalFile = datasetFile
    if (datasetUtils.basicTypes.includes(datasetFile.mimetype)) {
      patch.file = patch.originalFile
    }

    const newFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    await fs.move(loadedFilePath, newFilePath, { overwrite: true })
    if (dataset.originalFile) {
      const oldFilePath = datasetUtils.originalFilePath(dataset)
      if (oldFilePath !== newFilePath) {
        await fs.remove(oldFilePath)
      }
    }
  } else if (draft && !await fs.pathExists(datasetUtils.originalFilePath(dataset))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await fs.copy(datasetUtils.originalFilePath(datasetFull), datasetUtils.originalFilePath(dataset))
  }

  if (dataset.loaded?.attachments) {
    await replaceAllAttachments(dataset, datasetUtils.loadedAttachmentsFilePath(dataset))
  } else if (draft && await fs.pathExists(datasetUtils.attachmentsDir(datasetFull)) && !await fs.pathExists(datasetUtils.attachmentsDir(dataset))) {
    // this happens if we upload only the main data file and not the attachments
    // in this case copy the attachments directory from prod
    await fs.copy(datasetUtils.attachmentsDir(datasetFull), datasetUtils.attachmentsDir(dataset))
  }

  await fs.remove(loadingDir)

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
