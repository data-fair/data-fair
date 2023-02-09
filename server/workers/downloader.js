const mime = require('mime-types')
exports.eventsPrefix = 'download'

exports.process = async function (app, dataset) {
  const datasetFileSample = require('../utils/dataset-file-sample')
  const chardet = require('chardet')
  const axios = require('../utils/axios')
  const fs = require('fs-extra')
  const util = require('util')
  const pump = util.promisify(require('pump'))
  const limits = require('../utils/limits')
  const catalogs = require('../catalogs')
  const datasetUtils = require('../utils/dataset')
  const { basicTypes } = require('../workers/converter')

  const debug = require('debug')(`worker:downloader:${dataset.id}`)

  const db = app.get('db')

  const patch = {}
  patch.originalFile = {
    name: dataset.remoteFile.name,
    mimetype: mime.lookup(dataset.remoteFile.name),
    schema: []
  }

  let catalogHttpParams = {}
  if (dataset.remoteFile.catalog) {
    const catalog = await app.get('db').collection('catalogs')
      .findOne(
        { id: dataset.remoteFile.catalog, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id },
        { projection: { _id: 0 } })
    if (!catalog) throw new Error('Le fichier distant référence un catalogue inexistant. Il a probablement été supprimé.')
    catalogHttpParams = await catalogs.httpParams(catalog)
    debug(`Use HTTP params ${JSON.stringify(catalogHttpParams)}`)
  }

  const size = dataset.remoteFile.size || 0
  const remaining = await limits.remaining(db, dataset.owner)
  if (remaining.storage !== -1 && remaining.storage < size) throw new Error('Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed !== -1 && remaining.indexed < size) throw new Error('Vous avez atteint la limite de votre espace de données indexées.')

  const filePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(filePath)
  const response = await axios.get(dataset.remoteFile.url, { responseType: 'stream', ...catalogHttpParams })
  await pump(
    response.data,
    fs.createWriteStream(filePath)
  )
  debug(`Successfully downloaded file ${filePath}`)

  patch.originalFile.size = (await fs.promises.stat(filePath)).size

  if (!basicTypes.includes(patch.originalFile.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
    patch.file = patch.originalFile
    const fileSample = await datasetFileSample({ ...dataset, ...patch })
    patch.file.encoding = chardet.detect(fileSample)
  }

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
}
