const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const multer = require('multer')
const fieldsSniffer = require('./fields-sniffer')

function uploadDir(req) {
  return path.join(config.dataDir, req.body.owner.type, req.body.owner.id)
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (!req.body) {
      return cb(new Error(400))
    }
    if (req.dataset) {
      req.body.owner = req.dataset.owner
    }
    if (!req.body.owner || !req.body.owner.type || !req.body.owner.id) {
      return cb(new Error(400))
    }
    const dir = uploadDir(req)
    fs.ensureDirSync(dir)
    cb(null, dir)
  },
  filename: async function(req, file, cb) {
    file.title = path.parse(file.originalname).name
    const ext = path.parse(file.originalname).ext
    const baseId = fieldsSniffer.escapeKey(file.title).toLowerCase()

    if (req.dataset) {
      // Update dataset case
      file.id = req.dataset.id
    } else {
      // Create dataset case
      file.id = baseId
      let i = 1
      do {
        if (i > 1) file.id = baseId + i
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
  fileFilter: function fileFilter(req, file, cb) {
    cb(null, allowedTypes.has(file.mimetype))
  }
})

exports.uploadFile = () => upload.single('file')
