const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const multer = require('multer')
const createError = require('http-errors')
const slug = require('slugify')
const mime = require('mime-types')
const ajv = require('ajv')()
const ajvErrorMessages = require('ajv-error-messages')
const usersUtils = require('./users')
const datasetUtils = require('./dataset')
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)
const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet'
}

const { tabularTypes, geographicalTypes, archiveTypes } = require('../workers/converter')

function uploadDir(req) {
  const owner = usersUtils.owner(req)
  return path.join(config.dataDir, owner.type, owner.id)
}

const storage = multer.diskStorage({
  destination: async function(req, file, cb) {
    try {
      const dir = uploadDir(req)
      await fs.ensureDir(dir)
      cb(null, dir)
    } catch (err) {
      cb(err)
    }
  },
  filename: async function(req, file, cb) {
    try {
      const ext = path.parse(file.originalname).ext
      if (req.dataset) {
        // Update dataset case
        file.id = req.dataset.id
      } else {
        // Create dataset case
        const baseTitle = path.parse(file.originalname).name
        const baseId = slug(baseTitle, { lower: true })
        file.id = baseId
        file.title = baseTitle
        let i = 1
        do {
          if (i > 1) {
            file.id = baseId + i
            file.title = baseTitle + ' ' + i
          }
          // better to check file than db entry in case of file currently uploading
          var dbExists = await req.app.get('db').collection('datasets').countDocuments({ id: file.id })
          var fileExists = true
          try {
            await fs.stat(path.join(uploadDir(req), file.id + ext))
          } catch (err) {
            fileExists = false
          }
          i += 1
        } while (dbExists || fileExists)
      }
      file.path = path.join(uploadDir(req), file.id + ext)
      cb(null, file.id + ext)
    } catch (err) {
      cb(err)
    }
  }
})

const allowedTypes = exports.allowedTypes = new Set(['text/csv', 'application/geo+json', ...tabularTypes, ...geographicalTypes, ...archiveTypes])

// Form data fields are sent as strings, some have to be parsed as objects or arrays
const fixFormBody = (body) => {
  Object.keys(datasetPatchSchema.properties)
    .filter(key => body[key] !== undefined)
    .filter(key => ['object', 'array'].includes(datasetPatchSchema.properties[key].type))
    .forEach(key => {
      if (body[key].trim() === '') {
        delete body[key]
      } else {
        try {
          body[key] = JSON.parse(body[key])
        } catch (err) {
          throw createError('400', `Invalid JSON in part "${key}", ${err.message}`)
        }
      }
    })
}

const upload = multer({
  storage: storage,
  fileFilter: async function fileFilter(req, file, cb) {
    try {
      if (!req.user) throw createError(401)
      if (!req.body) throw createError(400, 'Missing body')
      fixFormBody(req.body)
      const valid = validatePatch(req.body)
      if (!valid) throw createError(400, JSON.stringify(ajvErrorMessages(validatePatch.errors)))

      let owner = usersUtils.owner(req)
      if (req.dataset) owner = req.dataset.owner
      // manage disk storage quota
      if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
      const contentLength = Number(req.get('Content-Length'))
      if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')
      // Approximate size of multi-part overhead and owner metadata
      const estimatedFileSize = contentLength - 210
      const datasetLimit = config.defaultLimits.datasetStorage
      if (datasetLimit !== -1 && datasetLimit < estimatedFileSize) throw createError(413, 'Dataset size exceeds the authorized limit')
      let storageRemaining = await datasetUtils.storageRemaining(req.app.get('db'), owner, req)
      if (storageRemaining !== -1) {
      // Ignore the size of the dataset we are overwriting
        if (req.dataset && req.dataset.file) storageRemaining += req.dataset.file.size
        storageRemaining = Math.max(0, storageRemaining - estimatedFileSize)
        if (storageRemaining === 0) throw createError(429, 'Requested storage exceeds the authorized limit')
      }

      // mime type is broken on windows it seems.. detect based on extension instead
      file.mimetype = mime.lookup(file.originalname) || fallbackMimeTypes[file.originalname.split('.').pop()] || file.originalname.split('.').pop()
      if (!allowedTypes.has(file.mimetype)) throw createError(400, file.mimetype + ' type is not supported')
      // TODO : store these file size limits in config file ?
      if (tabularTypes.has(file.mimetype) && estimatedFileSize > 10 * 1000 * 1000) throw createError(400, 'File size of this format must not exceed 10 MB. You can however convert your file to CSV with an external tool and reupload it.')
      if (geographicalTypes.has(file.mimetype) && estimatedFileSize > 100 * 1000 * 1000) throw createError(400, 'File size of this format must not exceed 10 MB. You can however convert your file to geoJSON with an external tool and reupload it.')
      cb(null, true)
    } catch (err) {
      cb(err)
    }
  }
})

exports.uploadFile = () => upload.single('file')
