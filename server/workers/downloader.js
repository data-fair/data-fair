const datasetFileSample = require('../utils/dataset-file-sample')
const chardet = require('chardet')
const baseTypes = new Set(['text/csv', 'application/geo+json'])
const config = require('config')
const request = require('request')
const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const pump = util.promisify(require('pump'))
const catalogs = require('../catalogs')
const datasetUtils = require('../utils/dataset')

exports.eventsPrefix = 'download'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:downloader:${dataset.id}`)

  const uploadDir = path.join(config.dataDir, dataset.owner.type, dataset.owner.id)
  await fs.ensureDir(uploadDir)

  debug(`Will attempt to download ${dataset.remoteFile.url} into ${uploadDir}`)

  dataset.originalFile = {
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
  const remainingStorage = await datasetUtils.remainingStorage(app.get('db'), dataset.owner)
  if (remainingStorage === 0) throw new Error('Vous avez atteint la limite de votre espace de stockage.')

  const fileName = datasetUtils.originalFileName(dataset)
  await pump(
    request({ ...catalogHttpParams, method: 'GET', url: dataset.remoteFile.url }),
    fs.createWriteStream(fileName)
  )
  debug(`Successfully downloaded file ${fileName}`)

  if (!baseTypes.has(dataset.originalFile.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    dataset.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    dataset.status = 'loaded'
    dataset.file = dataset.originalFile
    const fileSample = await datasetFileSample(dataset)
    dataset.file.encoding = chardet.detect(fileSample)
  }
  await app.get('db').collection('datasets').replaceOne({ id: dataset.id }, dataset)
  await datasetUtils.updateStorage(app.get('db'), dataset)
}
