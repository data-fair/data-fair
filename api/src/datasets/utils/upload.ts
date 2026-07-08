import fs from 'fs-extra'
import path from 'node:path'
import multer from 'multer'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime-types'
import { resolvedSchema as datasetSchema } from '#types/dataset/index.ts'
import * as datasetUtils from './index.ts'
import { tmpDir, fsyncFile } from './files.ts'
import promisifyMiddleware from '../../misc/utils/promisify-middleware.ts'
import { reqDatasetOptional, reqDraftOptional } from '../../misc/utils/req-context.ts'
import { basicTypes, tabularTypes, geographicalTypes, archiveTypes, calendarTypes, jsonTypes } from './types.ts'
import debugLib from 'debug'
import filesStorage from '#files-storage'
import tmp from 'tmp-promise'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { createHash } from 'node:crypto'

// a pass-through stream that md5-hashes the bytes flowing through it, so the file's md5 is computed
// in a single pass during upload — no local temp copy (S3 streams straight through) and no re-read.
const md5Tee = () => {
  const hash = createHash('md5')
  const stream = new Transform({ transform (chunk, _enc, cb) { hash.update(chunk); cb(null, chunk) } })
  return { stream, digest: () => hash.digest('hex') }
}

const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet',
  gpkg: 'application/geopackage+sqlite3',
  jsonl: 'application/x-ndjson',
  ndjson: 'application/x-ndjson',
}
const debug = debugLib('files')

// inspired by https://github.com/expressjs/multer/blob/main/storage/disk.js
// but uses our files storage abstraction
const storage = {
  async _handleFile (req: any, file: any, cb: (err?: any, file?: any) => void) {
    try {
      const filename = file.fieldname === 'attachments' ? 'attachments.zip' : file.originalname
      const dataset = reqDatasetOptional(req)
      const tee = md5Tee()
      if (dataset) {
        const destination = datasetUtils.loadingDir({ ...dataset, draftReason: req.query.draft === 'true' || reqDraftOptional(req) })
        const finalPath = path.join(destination, filename)
        // forward a source read error to the tee so the storage upload rejects instead of hanging
        file.stream.on('error', (err: any) => tee.stream.destroy(err))
        await filesStorage.writeStream(file.stream.pipe(tee.stream), finalPath)
        const stats = await filesStorage.fileStats(finalPath)
        cb(null, {
          destination,
          filename,
          path: finalPath,
          size: stats.size,
          md5: tee.digest()
        })
      } else {
        const destination = await tmp.tmpName({ tmpdir: tmpDir })
        const finalPath = path.join(destination, filename)
        await fs.ensureFile(finalPath)
        await pipeline(file.stream, tee.stream, fs.createWriteStream(finalPath))
        await fsyncFile(finalPath)
        const stats = await fs.stat(finalPath)
        cb(null, {
          destination,
          filename,
          path: finalPath,
          size: stats.size,
          md5: tee.digest()
        })
      }
    } catch (err) {
      cb(err)
    }
  },

  async _removeFile  (req: any, file: any, cb: (err?: any) => void) {
    try {
      const path = file.path
      delete file.destination
      delete file.filename
      delete file.path
      if (reqDatasetOptional(req)) {
        await filesStorage.removeFile(path)
      } else {
        await fs.remove(path)
      }
      cb()
    } catch (err) {
      cb(err)
    }
  }
}

export const allowedTypes = new Set([...basicTypes, ...tabularTypes, ...geographicalTypes, ...archiveTypes, ...calendarTypes, ...jsonTypes])

const middleware = multer({
  limits: {
    files: 2 // no more than the dataset file + attachments archive
  },
  storage,
  fileFilter: async function fileFilter (req, file, cb) {
    try {
      debug('Accept file ?', file.originalname)
      // mime type is broken on windows it seems.. detect based on extension instead
      file.mimetype = mime.lookup(file.originalname) || fallbackMimeTypes[file.originalname.split('.').pop()] || file.originalname.split('.').pop()

      if (file.fieldname === 'file' || file.fieldname === 'dataset') {
        if (!allowedTypes.has(file.mimetype)) {
          if (file.mimetype === 'application/gzip' && basicTypes.includes(mime.lookup(file.originalname.slice(0, file.originalname.length - 3)))) {
            // gzip of a csv or other basic type is also accepted, file-normalizer will proceed
          } else {
            throw httpError(400, file.mimetype + ' type is not supported')
          }
        }
      } else if (file.fieldname === 'attachments') {
        if (file.mimetype !== 'application/zip') throw httpError(400, 'Les fichiers joints doivent être embarqués dans une archive zip')
      } else {
        throw httpError(400, `Fichier dans un champ non supporté: "${file.fieldname}"`)
      }
      debug('File accepted', file.originalname)
      cb(null, true)
    } catch (err) {
      debug('File rejected', err)
      cb(err)
    }
  }
}).any()

const getMulterFiles = promisifyMiddleware(middleware, 'files')

export const getFiles = async (req, res) => {
  const files = await getMulterFiles(req, res)
  for (const file of files || []) {
    if (req.body?.[file.fieldname + '_encoding']) {
      file.explicitEncoding = req.body?.[file.fieldname + '_encoding']
      delete req.body[file.fieldname + '_encoding']
    }
    if (req.body?.[file.fieldname + '_normalizeOptions']) {
      file.normalizeOptions = JSON.parse(req.body?.[file.fieldname + '_normalizeOptions'])
      delete req.body[file.fieldname + '_normalizeOptions']
    }
  }
  return files
}

export const getFormBody = (body) => {
  if (!body) throw httpError(400, 'Missing body')
  if (body.body) {
    try {
      return JSON.parse(body.body)
    } catch (err) {
      throw httpError(400, `Invalid JSON in body part, ${err.message}`)
    }
  }
  for (const key of Object.keys(datasetSchema.properties)) {
    if (typeof body[key] === 'string') {
      if (['object', 'array'].includes(datasetSchema.properties[key].type)) {
        if (body[key].trim() === '') {
          delete body[key]
        } else {
          try {
            body[key] = JSON.parse(body[key])
          } catch (err) {
            throw httpError(400, `Invalid JSON in part "${key}", ${err.message}`)
          }
        }
      }
      if (datasetSchema.properties[key].type === 'boolean') {
        body[key] = body[key] === 'true'
      }
    }
  }
  return body
}

export const fsyncFiles = async (req, res, next) => {
  for (const file of req.files || []) {
    await fsyncFile(file.path)
  }
  next()
}
