const fs = require('fs-extra')
const config = /** @type {any} */(require('config'))
const path = require('path')
const multer = require('multer')
const createError = require('http-errors')
const { nanoid } = require('nanoid')
const mime = require('mime-types')
const datasetSchema = require('../../../contract/dataset')
const datasetUtils = require('./')
const asyncWrap = require('../../misc/utils/async-handler')
const promisifyMiddleware = require('../../misc/utils/promisify-middleware')
const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet',
  gpkg: 'application/geopackage+sqlite3'
}
const debug = require('debug')('files')

const { basicTypes, tabularTypes, geographicalTypes, archiveTypes, calendarTypes } = require('../../workers/file-normalizer')

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      if (req.dataset) {
        req.uploadDir = datasetUtils.loadingDir({ ...req.dataset, draftReason: req.query.draft === 'true' })
      } else {
        // a tmp dir in case of new dataset, it will be moved into the actual dataset directory
        // after upload completion and final id atttribution
        req.uploadDir = path.join(config.dataDir, 'tmp', nanoid())
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
        await fs.ensureFile(path.join(req.uploadDir, 'attachments.zip'))
        return cb(null, 'attachments.zip')
      }

      // creating empty file before streaming seems to fix some weird bugs with NFS
      await fs.ensureFile(path.join(req.uploadDir, file.originalname))
      cb(null, file.originalname)
    } catch (err) {
      cb(err)
    }
  }
})

const allowedTypes = exports.allowedTypes = new Set([...basicTypes, ...tabularTypes, ...geographicalTypes, ...archiveTypes, ...calendarTypes])

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

// TODO: remove deprecated
exports.uploadFile = () => middleware

const getMulterFiles = promisifyMiddleware(middleware, 'files')

exports.getFiles = async (req, res) => {
  const files = await getMulterFiles(req, res)
  for (const file of files || []) {
    await fsyncFile(file.path)
  }
  return files
}

exports.getFormBody = (body) => {
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

// TODO: remove deprecated
// Form data fields are sent as strings, some have to be parsed as objects or arrays
exports.fixFormBody = (validate) => (req, res, next) => {
  if (!req.body) return res.status(400).type('text/plain').send('Missing body')
  req.body = exports.getFormBody(req.body)
  validate(req.body)
  next()
}

// try to prevent weird bug with NFS by forcing syncing new files before use
const fsyncFile = async (p) => {
  const fd = await fs.open(p, 'r')
  await fs.fsync(fd)
  await fs.close(fd)
}

// TODO: remove deprecated
exports.fsyncFiles = asyncWrap(async (req, res, next) => {
  for (const file of req.files || []) {
    await fsyncFile(file.path)
  }
  next()
})
