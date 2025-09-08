import config from '#config'
import mongo from '#mongo'
import { text as stream2text } from 'node:stream/consumers'
import path from 'path'
import tmp from 'tmp-promise'
import fs from 'fs-extra'
import mime from 'mime-types'
import md5File from 'md5-file'
import { CronJob } from 'cron'
import contentDisposition from 'content-disposition'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import axios from '../../misc/utils/axios.js'
import pump from '../../misc/utils/pipe.ts'
import * as limits from '../../misc/utils/limits.ts'
import * as catalogs from '../../catalogs/plugins/index.js'
import * as datasetUtils from '../../datasets/utils/index.js'
import * as datasetService from '../../datasets/service.js'
import { tmpDir } from '../../datasets/utils/files.ts'
import debugLib from 'debug'
import type { Dataset, DatasetInternal } from '#types'

export default async function (dataset: Dataset) {
  const debug = debugLib(`worker:downloader:${dataset.id}`)

  const db = mongo.db

  await fs.ensureDir(tmpDir)
  const tmpFile = await tmp.file({ tmpdir: tmpDir, prefix: 'download-' })
  const now = new Date().toISOString()

  let catalogHttpParams: any = {}
  if (dataset.remoteFile!.catalog) {
    const catalog = await mongo.db.collection('catalogs')
      .findOne(
        { id: dataset.remoteFile!.catalog, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id },
        { projection: { _id: 0 } })
    if (!catalog) throw httpError(400, '[noretry] Le fichier distant référence un catalogue inexistant. Il a probablement été supprimé.')
    catalogHttpParams = await catalogs.httpParams(catalog, dataset.remoteFile!.url)
  }

  const size = dataset.remoteFile!.size || 0
  const remaining = await limits.remaining(dataset.owner)
  if (remaining.storage !== -1 && remaining.storage < size) throw httpError(429, '[noretry] Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed !== -1 && remaining.indexed < size) throw httpError(429, '[noretry] Vous avez atteint la limite de votre espace de données indexées.')

  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpFile.path)
  const headers = catalogHttpParams.headers ? { ...catalogHttpParams.headers } : {}
  if (!dataset.remoteFile!.forceUpdate) {
    if (dataset.remoteFile?.etag) headers['If-None-Match'] = dataset.remoteFile.etag
    if (dataset.remoteFile?.lastModified) headers['If-Modified-Since'] = dataset.remoteFile.lastModified
  }
  const response = await axios.get(dataset.remoteFile!.url, {
    responseType: 'stream',
    ...catalogHttpParams,
    headers,
    validateStatus: () => true
  })

  if (response.status !== 200 && response.status !== 304) {
    let message = `${response.status} - ${response.statusText}`
    if (response.headers['content-type']?.startsWith('text/plain')) {
      const data = await stream2text(response.data)
      if (data) message = data
    }
    throw httpError(response.status, '[noretry] Échec de téléchargement du fichier : ' + message)
  }

  await pump(
    response.data,
    fs.createWriteStream(tmpFile.path)
  )
  debug(`Successfully downloaded file ${tmpFile.path}`)

  let fileName = dataset.remoteFile!.name
  if (!fileName && response.headers['content-disposition']) {
    const parsed = contentDisposition.parse(response.headers['content-disposition'])
    fileName = parsed?.parameters?.filename
  }
  if (!fileName) {
    fileName = path.basename(new URL(dataset.remoteFile!.url).pathname)
  }

  const parsedFileName = path.parse(fileName)
  let mimetype = dataset.remoteFile!.mimetype ?? response.headers['content-type']?.split(';').shift() ?? mime.lookup(fileName)

  // sometimes geojson is served with simple json mime type, be tolerant, same for csv and text/plain
  if (mimetype === 'application/json' && parsedFileName.ext === '.geojson') mimetype = 'application/geo+json'
  if (mimetype === 'text/plain' && parsedFileName.ext === '.csv') mimetype = 'text/csv'

  if (!parsedFileName.ext || mime.lookup(fileName) !== mimetype) {
    fileName = parsedFileName.name + '.' + mime.extension(mimetype)
  }

  const patch: Partial<DatasetInternal> = {}
  patch.loaded = {
    dataset: {
      name: fileName,
      mimetype
    }
  }

  const md5 = await md5File(tmpFile.path)

  const filePath = datasetUtils.loadedFilePath({ ...dataset, ...patch })

  patch.remoteFile = patch.remoteFile || { ...dataset.remoteFile! }

  if (response.status === 304 || (!dataset.remoteFile!.forceUpdate && dataset.originalFile && dataset.originalFile.md5 === md5)) {
    // prevent re-indexing when the file didn't change
    debug('content of remote file did not change')
    await tmpFile.cleanup()
  } else {
    if (response.headers.etag) {
      patch.remoteFile!.etag = response.headers.etag
      debug('store etag header for future conditional fetch', response.headers.etag)
    } else {
      delete patch.remoteFile!.etag
    }
    if (response.headers['last-modified']) {
      patch.remoteFile!.lastModified = response.headers['last-modified']
      debug('store last-modified header for future conditional fetch', response.headers['last-modified'])
    } else {
      delete patch.remoteFile!.lastModified
    }

    await fs.move(tmpFile.path, filePath, { overwrite: true })

    patch.loaded!.dataset!.md5 = md5
    patch.loaded!.dataset!.size = (await fs.promises.stat(filePath)).size
    patch.status = 'loaded'
    patch.dataUpdatedAt = now
  }

  delete patch.remoteFile!.forceUpdate

  if (dataset.remoteFile!.autoUpdate?.active && !dataset.remoteFile!.forceUpdate) {
    const job = new CronJob(config.remoteFilesAutoUpdates.cron, () => {})
    patch.remoteFile!.autoUpdate = {
      ...patch.remoteFile!.autoUpdate,
      lastUpdate: now,
      nextUpdate: job.nextDate().toISO()!
    }
  }

  if (dataset.draftReason && !patch.status) {
    await db.collection('datasets').findOneAndUpdate(
      { id: dataset.id },
      { $unset: { draft: '' }, $set: { remoteFile: patch.remoteFile } }
    )
  } else {
    await datasetService.applyPatch(dataset, patch)
  }
}
