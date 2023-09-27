const config = require('config')

exports.eventsPrefix = 'download'

exports.process = async function (app, dataset) {
  const path = require('path')
  const chardet = require('chardet')
  const tmp = require('tmp-promise')
  const fs = require('fs-extra')
  const mime = require('mime-types')
  const md5File = require('md5-file')
  const axios = require('../utils/axios')
  const datasetFileSample = require('../utils/dataset-file-sample')
  const pump = require('../utils/pipe')
  const limits = require('../utils/limits')
  const catalogs = require('../catalogs')
  const datasetUtils = require('../utils/dataset')
  const { basicTypes } = require('../workers/converter')

  const debug = require('debug')(`worker:downloader:${dataset.id}`)

  const db = app.get('db')

  const dataDir = path.resolve(config.dataDir)
  await fs.ensureDir(path.join(dataDir, 'tmp'))
  const tmpFile = await tmp.file({ dir: path.join(dataDir, 'tmp') })

  const patch = {}
  patch.originalFile = {
    name: dataset.remoteFile.name,
    mimetype: mime.lookup(dataset.remoteFile.name)
  }

  let catalogHttpParams = {}
  if (dataset.remoteFile.catalog) {
    const catalog = await app.get('db').collection('catalogs')
      .findOne(
        { id: dataset.remoteFile.catalog, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id },
        { projection: { _id: 0 } })
    if (!catalog) throw new Error('Le fichier distant référence un catalogue inexistant. Il a probablement été supprimé.')
    catalogHttpParams = await catalogs.httpParams(catalog, dataset.remoteFile.url)
  }

  const size = dataset.remoteFile.size || 0
  const remaining = await limits.remaining(db, dataset.owner)
  if (remaining.storage !== -1 && remaining.storage < size) throw new Error('Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed !== -1 && remaining.indexed < size) throw new Error('Vous avez atteint la limite de votre espace de données indexées.')

  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpFile.path)
  const headers = catalogHttpParams.headers ? { ...catalogHttpParams.headers } : {}
  if (dataset.remoteFile?.etag) headers['If-None-Match'] = dataset.remoteFile.etag
  if (dataset.remoteFile?.lastModified) headers['If-Modified-Since'] = dataset.remoteFile.lastModified
  const response = await axios.get(dataset.remoteFile.url, {
    responseType: 'stream',
    ...catalogHttpParams,
    headers,
    validateStatus: function (status) {
      return status === 200 || status === 304
    }
  })
  await pump(
    response.data,
    fs.createWriteStream(tmpFile.path)
  )
  debug(`Successfully downloaded file ${tmpFile.path}`)

  const md5 = await md5File(tmpFile.path)

  if (response.status === 304 || (dataset.originalFile && dataset.originalFile.md5 === md5)) {
    // prevent re-indexing when the file didn't change
    debug('content of remote file did not change')
    await tmpFile.cleanup()
    await datasetUtils.applyPatch(db, dataset, { status: 'finalized' })
    return
  }

  if (response.headers.etag) {
    patch.remoteFile = patch.remoteFile || { ...dataset.remoteFile }
    patch.remoteFile.etag = response.headers.etag
    debug('store etag header for future conditional fetch', response.headers.etag)
  }
  if (response.headers['last-modified']) {
    patch.remoteFile = patch.remoteFile || { ...dataset.remoteFile }
    patch.remoteFile.lastModified = response.headers['last-modified']
    debug('store last-modified header for future conditional fetch', response.headers['last-modified'])
  }

  const filePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
  await fs.move(tmpFile.path, filePath, { overwrite: true })

  patch.originalFile.md5 = md5
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
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
