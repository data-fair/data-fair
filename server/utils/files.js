const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const multer = require('multer')
const createError = require('http-errors')
const slug = require('slugify')
const shortid = require('shortid')
const mime = require('mime-types')
const usersUtils = require('./users')
const datasetSchema = require('../../contract/dataset')
const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet'
}
const debug = require('debug')('files')

const { tabularTypes, geographicalTypes, archiveTypes, calendarTypes } = require('../workers/converter')

function uploadDir(req) {
  const owner = usersUtils.owner(req)
  return path.join(config.dataDir, owner.type, owner.id)
}

const storage = multer.diskStorage({
  destination: async function(req, file, cb) {
    try {
      const dir = uploadDir(req)
      debug('Create destination directory', dir)
      await fs.ensureDir(dir)
      cb(null, dir)
    } catch (err) {
      cb(err)
    }
  },
  filename: async function(req, file, cb) {
    try {
      if (file.fieldname === 'attachments') {
        const attachmentsTmp = shortid.generate()
        const attachmentsPath = path.join(uploadDir(req), attachmentsTmp)
        // creating empty file before streaming seems to fix some weird bugs with NFS
        await fs.ensureFile(attachmentsPath)
        return cb(null, attachmentsTmp)
      }
      const ext = path.parse(file.originalname).ext
      if (req.dataset) {
        // Update dataset case
        file.id = req.dataset.id
      } else {
        // Create dataset case

        // better to split, so we create something more firendly for full text search
        const baseTitle = req.body.title || path.parse(file.originalname).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
        const baseId = slug(baseTitle, { lower: true })
        file.id = baseId
        file.title = baseTitle
        let i = 1; let dbExists = false; let fileExists = false
        do {
          if (i > 1) {
            file.id = baseId + i
            file.title = baseTitle + ' ' + i
          }
          // better to check file as well as db entry in case of file currently uploading
          dbExists = await req.app.get('db').collection('datasets').countDocuments({ id: file.id })
          fileExists = await fs.exists(path.join(uploadDir(req), file.id + ext))
          i += 1
        } while (dbExists || fileExists)
      }
      file.path = path.join(uploadDir(req), file.id + ext)
      debug(`Use path ${file.path} as full destination`)

      // creating empty file before streaming seems to fix some weird bugs with NFS
      await fs.ensureFile(file.path)

      cb(null, file.id + ext)
    } catch (err) {
      cb(err)
    }
  }
})

const allowedTypes = exports.allowedTypes = new Set(['text/csv', 'application/geo+json', ...tabularTypes, ...geographicalTypes, ...archiveTypes, ...calendarTypes])

// Form data fields are sent as strings, some have to be parsed as objects or arrays
const fixFormBody = (body) => {
  Object.keys(datasetSchema.properties)
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

exports.uploadFile = (validate) => {
  return multer({
    limits: {
      files: 2 // no more than the dataset file + attachments archive
    },
    storage,
    fileFilter: async function fileFilter(req, file, cb) {
      try {
        debug('Accept file ?', file.originalname)
        // Input verification, only performed once, not for attachments and dataset both
        if (!req.inputChecked) {
          if (!req.user) throw createError(401)
          if (!req.body) throw createError(400, 'Missing body')
          fixFormBody(req.body)
          const valid = validate(req.body)
          if (!valid) throw createError(400, JSON.stringify(validate.errors))
          req.inputChecked = true
        }

        // mime type is broken on windows it seems.. detect based on extension instead
        file.mimetype = mime.lookup(file.originalname) || fallbackMimeTypes[file.originalname.split('.').pop()] || file.originalname.split('.').pop()

        if (file.fieldname === 'file' || file.fieldname === 'dataset') {
          if (!allowedTypes.has(file.mimetype)) throw createError(400, file.mimetype + ' type is not supported')
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
}
