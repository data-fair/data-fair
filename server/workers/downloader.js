const datasetFileSample = require('../utils/dataset-file-sample')
const chardet = require('chardet')
const request = require('request')
const fs = require('fs-extra')
const util = require('util')
const pump = util.promisify(require('pump'))
const catalogs = require('../catalogs')
const datasetUtils = require('../utils/dataset')
const { basicTypes } = require('../workers/converter')

exports.eventsPrefix = 'download'

exports.process = async function (app, dataset) {
  const debug = require('debug')(`worker:downloader:${dataset.id}`)

  const db = app.get('db')

  const patch = {}
  patch.originalFile = {
    name: dataset.remoteFile.name,
    mimetype: dataset.remoteFile.mimetype,
    size: dataset.remoteFile.size
  }

  let catalogHttpParams = {}
  if (dataset.remoteFile.catalog) {
    const catalog = await app.get('db').collection('catalogs')
      .findOne({ id: dataset.remoteFile.catalog }, { projection: { _id: 0 } })
    if (!catalog) throw new Error('Le fichier distant référence un catalogue inexistant. Il a probablement été supprimé.')
    catalogHttpParams = await catalogs.httpParams(catalog)
    debug(`Use HTTP params ${JSON.stringify(catalogHttpParams)}`)
  }

  // Manage file size
  const remaining = await datasetUtils.remainingStorage(app.get('db'), dataset.owner)
  if (remaining.storage === 0) throw new Error('Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed === 0) throw new Error('Vous avez atteint la limite de votre espace de données indexées.')

  const filePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
  await pump(
    request({ ...catalogHttpParams, method: 'GET', url: dataset.remoteFile.url }),
    fs.createWriteStream(filePath)
  )
  debug(`Successfully downloaded file ${filePath}`)

  if (!basicTypes.includes(dataset.originalFile.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
    patch.file = dataset.originalFile
    const fileSample = await datasetFileSample(dataset)
    patch.file.encoding = chardet.detect(fileSample)
  }

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
}
