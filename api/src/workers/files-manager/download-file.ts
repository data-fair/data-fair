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
import * as datasetUtils from '../../datasets/utils/index.js'
import * as datasetService from '../../datasets/service.js'
import { tmpDir } from '../../datasets/utils/files.ts'
import debugLib from 'debug'
import type { Dataset, DatasetInternal } from '#types'
import filesStorage from '#files-storage'

export default async function (dataset: Dataset) {
  const debug = debugLib(`worker:downloader:${dataset.id}`)

  const db = mongo.db

  await fs.ensureDir(tmpDir)
  const tmpFile = await tmp.file({ tmpdir: tmpDir, prefix: 'download-' })
  const now = new Date().toISOString()

  const size = dataset.remoteFile!.size || 0
  const remaining = await limits.remaining(dataset.owner)
  if (remaining.storage !== -1 && remaining.storage < size) throw httpError(429, '[noretry] Vous avez atteint la limite de votre espace de stockage.')
  if (remaining.indexed !== -1 && remaining.indexed < size) throw httpError(429, '[noretry] Vous avez atteint la limite de votre espace de données indexées.')

  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpFile.path)
  const headers: Record<string, string> = {}
  if (!dataset.remoteFile!.forceUpdate) {
    if (dataset.remoteFile?.etag) headers['If-None-Match'] = dataset.remoteFile.etag
    if (dataset.remoteFile?.lastModified) headers['If-Modified-Since'] = dataset.remoteFile.lastModified
  }
  const response = await axios.get(dataset.remoteFile!.url, {
    responseType: 'stream',
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

    await filesStorage.moveFromFs(tmpFile.path, filePath)
    const stats = await filesStorage.fileStats(filePath)

    patch.loaded!.dataset!.md5 = md5
    patch.loaded!.dataset!.size = stats.size
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
