const fs = require('fs-extra')
const datasetUtils = require('../../datasets/utils')
const { basicTypes } = require('../../datasets/utils/files')
const datasetFileSample = require('../../datasets/utils/file-sample')
const metrics = require('../../misc/utils/metrics')
const chardet = require('chardet')
const md5File = require('md5-file')
const JSONStream = require('JSONStream')

exports.process = async function (app, dataset, patch) {
  const debug = require('debug')(`worker:file-detector:${dataset.id}`)

  /** @type {any} */
  patch.loaded = null
  const draft = !!dataset.draftReason

  const datasetFull = await app.get('db').collection('datasets').findOne({ id: dataset.id })

  const datasetFile = dataset._currentUpdate.dataFile
  if (datasetFile) {
    const loadedFilePath = datasetUtils.loadedFilePath(dataset)

    if (!await fs.pathExists(loadedFilePath)) {
      // we should not have to do this
      // this is a weird thing, maybe an unsolved race condition ?
      // let's wait a bit and try again to mask this problem temporarily
      metrics.internalError('storer-missing-file', 'file missing when detector started working ' + loadedFilePath)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    // manage some special cases of invalid files
    // some ESRI files have invalid geojson with stuff like this:
    // "GLOBALID": {7E1C9E26-9767-4AE4-9CBB-F353B15B3BFE},
    if (dataset.extras?.fixGeojsonGlobalId || dataset.extras?.fixGeojsonESRI) {
      const { Transform } = require('stream')
      const split2 = require('split2')
      const pump = require('../../misc/utils/pipe')

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
    if (basicTypes.includes(datasetFile.mimetype)) {
      patch.file = patch.originalFile
    }
  } else if (draft && !await fs.pathExists(datasetUtils.originalFilePath(dataset))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await fs.copy(datasetUtils.originalFilePath(datasetFull), datasetUtils.loadedFilePath(dataset))
  }

  if (!dataset.loaded?.attachments && draft && await fs.pathExists(datasetUtils.attachmentsDir(datasetFull)) && !await fs.pathExists(datasetUtils.attachmentsDir(dataset))) {
    // this happens if we upload only the main data file and not the attachments
    // in this case copy the attachments directory from prod
    await fs.copy(datasetUtils.attachmentsDir(datasetFull), datasetUtils.loadedAttachmentsDir(dataset))
  }

  debug('done')
}
