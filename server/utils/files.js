const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const multer = require('multer')
const createError = require('http-errors')
const datasetUtils = require('./dataset')
const slug = require('slug')
const mime = require('mime-types')

function uploadDir(req) {
  return path.join(config.dataDir, req.get('x-organizationId') ? 'organization' : 'user', req.get('x-organizationId') || req.user.id)
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = uploadDir(req)
    fs.ensureDirSync(dir)
    cb(null, dir)
  },
  filename: async function(req, file, cb) {
    const ext = path.parse(file.originalname).ext
    if (req.dataset) {
      // Update dataset case
      file.id = req.dataset.id
    } else {
      // Create dataset case
      const baseTitle = path.parse(file.originalname).name
      const baseId = slug(baseTitle, {lower: true})
      file.id = baseId
      file.title = baseTitle
      let i = 1
      do {
        if (i > 1) {
          file.id = baseId + i
          file.title = baseTitle + ' ' + i
        }
        // better to check file than db entry in case of file currently uploading
        var dbExists = await req.app.get('db').collection('datasets').count({id: file.id})
        var fileExists = true
        try {
          await fs.stat(path.join(uploadDir(req), file.id + ext))
        } catch (err) {
          fileExists = false
        }
        i += 1
      } while (dbExists || fileExists)
    }
    cb(null, file.id + ext)
  }
})

const allowedTypes = new Set(['text/csv'])

const upload = multer({
  storage: storage,
  fileFilter: async function fileFilter(req, file, cb) {
    if (!req.body) return cb(createError(400, 'Missing body'))

    let owner = {type: req.get('x-organizationId') ? 'organization' : 'user', id: req.get('x-organizationId') || req.user.id}
    if (req.dataset) owner = req.dataset.owner
    // manage disk storage quota
    if (!req.get('Content-Length')) return cb(createError(411, 'Content-Length is mandatory'))
    const contentLength = Number(req.get('Content-Length'))
    if (Number.isNaN(contentLength)) return cb(createError(400, 'Content-Length is not a number'))
    // Approximate size of multi-part overhead and owner metadata
    const estimatedFileSize = contentLength - 210
    const datasetLimit = config.defaultLimits.datasetStorage
    if (datasetLimit !== -1 && datasetLimit < estimatedFileSize) return cb(createError(413, 'Dataset size exceeds the authorized limit'))
    let totalSize = await datasetUtils.storageSize(req.app.get('db'), owner)
    if (req.dataset) {
      // Ignore the size of the dataset we are overwriting
      totalSize -= req.dataset.file.size
    }
    const proxyLimit = req.get(config.headers.storedBytesLimit)
    const limit = proxyLimit ? parseInt(proxyLimit) : config.defaultLimits.totalStorage
    if (limit !== -1) {
      req.storageRemaining = Math.max(0, limit - (totalSize + estimatedFileSize))
      if (req.storageRemaining === 0) return cb(createError(429, 'Requested storage exceeds the authorized limit'))
    }

    // mime type is broken on windows it seems.. detect based on extension instead
    file.mimetype = mime.lookup(file.originalname)
    if (!allowedTypes.has(file.mimetype)) return cb(createError(400, file.mimetype + ' type is not supported'))

    cb(null, true)
  }
})

exports.uploadFile = () => upload.single('file')
