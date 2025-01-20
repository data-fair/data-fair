import fs from 'fs-extra'
import multer from 'multer'
import createError from 'http-errors'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import resolvePath from 'resolve-path'
import datasetSchema from '../../../contract/dataset.js'
import * as datasetUtils from './index.js'
import { tmpDir, fsyncFile } from './files.js'
import promisifyMiddleware from '../../misc/utils/promisify-middleware.js'
import { basicTypes, tabularTypes, geographicalTypes, archiveTypes, calendarTypes } from './types.js'
import debugLib from 'debug'

const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet',
  gpkg: 'application/geopackage+sqlite3'
}
const debug = debugLib('files')

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      if (req.dataset) {
        req.uploadDir = datasetUtils.loadingDir({ ...req.dataset, draftReason: req.query.draft === 'true' || req._draft })
      } else {
        // a tmp dir in case of new dataset, it will be moved into the actual dataset directory
        // after upload completion and final id atttribution
        req.uploadDir = resolvePath(tmpDir, nanoid())
      }
      debug('Create destination directory', req.uploadDir)
      await fs.ensureDir(req.uploadDir)
      cb(null, req.uploadDir)
    } catch (err) {
      cb(err)
    }
  },
  filename: async function (req, file, cb) {
    try {
      if (file.fieldname === 'attachments') {
        // creating empty file before streaming seems to fix some weird bugs with NFS
        await fs.ensureFile(resolvePath(req.uploadDir, 'attachments.zip'))
        return cb(null, 'attachments.zip')
      }

      // creating empty file before streaming seems to fix some weird bugs with NFS
      await fs.ensureFile(resolvePath(req.uploadDir, file.originalname))
      cb(null, file.originalname)
    } catch (err) {
      cb(err)
    }
  }
})

export const allowedTypes = new Set([...basicTypes, ...tabularTypes, ...geographicalTypes, ...archiveTypes, ...calendarTypes])

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
            throw createError(400, file.mimetype + ' type is not supported')
          }
        }
      } else if (file.fieldname === 'attachments') {
        if (file.mimetype !== 'application/zip') throw createError(400, 'Les fichiers joints doivent être embarqués dans une archive zip')
      } else {
        throw createError(400, `Fichier dans un champ non supporté: "${file.fieldname}"`)
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
    await fsyncFile(file.path)
  }
  return files
}

export const getFormBody = (body) => {
  if (!body) throw createError(400, 'Missing body')
  if (body.body) {
    try {
      return JSON.parse(body.body)
    } catch (err) {
      throw createError('400', `Invalid JSON in body part, ${err.message}`)
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
            throw createError('400', `Invalid JSON in part "${key}", ${err.message}`)
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
