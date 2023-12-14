const config = require('config')

exports.eventsPrefix = 'download'

exports.process = async function (app, dataset) {
  const path = require('path')
  const chardet = require('chardet')
  const tmp = require('tmp-promise')
  const fs = require('fs-extra')
  const mime = require('mime-types')
  const md5File = require('md5-file')
  const CronJob = require('cron').CronJob
  const contentDisposition = require('content-disposition')
  const createError = require('http-errors')
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

  let catalogHttpParams = {}
  if (dataset.remoteFile.catalog) {
    const catalog = await app.get('db').collection('catalogs')
      .findOne(
        { id: dataset.remoteFile.catalog, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id },
        { projection: { _id: 0 } })
    if (!catalog) throw createError(400, '[noretry] Le fichier distant référence un catalogue inexistant. Il a probablement été supprimé.')
    catalogHttpParams = await catalogs.httpParams(catalog, dataset.remoteFile.url)
  }

  const size = dataset.remoteFile.size || 0
  const remaining = await limits.remaining(db, dataset.owner)
  if (remaining.storage !== -1 && remaining.storage < size) throw createError(429, '[noretry] Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed !== -1 && remaining.indexed < size) throw createError(429, '[noretry] Vous avez atteint la limite de votre espace de données indexées.')

  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpFile.path)
  const headers = catalogHttpParams.headers ? { ...catalogHttpParams.headers } : {}
  const autoUpdating = dataset.status !== 'imported'
  if (autoUpdating) {
    if (dataset.remoteFile?.etag) headers['If-None-Match'] = dataset.remoteFile.etag
    if (dataset.remoteFile?.lastModified) headers['If-Modified-Since'] = dataset.remoteFile.lastModified
  }
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

  let fileName = dataset.remoteFile.name
  if (!fileName && response.headers['content-disposition']) {
    const parsed = contentDisposition.parse(response.headers['content-disposition'])
    fileName = parsed?.parameters?.filename
  }
  if (!fileName) {
    fileName = path.basename(new URL(dataset.remoteFile.url).pathname)
  }
  const mimetype = dataset.remoteFile.mimetype ?? response.headers['content-type']?.split(';').shift() ?? mime.lookup(fileName)
  const parsedFileName = path.parse(fileName)
  if (!parsedFileName.ext || mime.lookup(fileName) !== mimetype) {
    fileName = parsedFileName.name + '.' + mime.extension(mimetype)
  }

  const patch = {}
  patch.originalFile = {
    name: fileName,
    mimetype
  }

  const md5 = await md5File(tmpFile.path)

  const oldFilePath = dataset.originalFile && datasetUtils.originalFilePath(dataset)
  const filePath = datasetUtils.originalFilePath({ ...dataset, ...patch })

  if (response.status === 304 || (autoUpdating && dataset.originalFile && dataset.originalFile.md5 === md5)) {
    // prevent re-indexing when the file didn't change
    debug('content of remote file did not change')
    await tmpFile.cleanup()
    if (oldFilePath !== filePath) {
      await fs.move(oldFilePath, filePath, { overwrite: true })
      patch.file = patch.originalFile
    }
  } else {
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

    await fs.move(tmpFile.path, filePath, { overwrite: true })
    if (oldFilePath && oldFilePath !== filePath) {
      await fs.remove(oldFilePath)
    }

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
  }

  if (autoUpdating) {
    patch.remoteFile = patch.remoteFile || { ...dataset.remoteFile }
    const job = new CronJob(config.remoteFilesAutoUpdates.cron, () => {})
    patch.remoteFile.autoUpdate = {
      ...patch.remoteFile.autoUpdate,
      lastUpdate: new Date().toISOString(),
      nextUpdate: job.nextDates().toISOString()
    }
  }

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
