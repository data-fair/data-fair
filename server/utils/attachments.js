const fs = require('fs-extra')
const path = require('path')
const multer = require('multer')
const config = require('config')
const createError = require('http-errors')
const mime = require('mime-types')
const datasetUtils = require('./dataset')
const exec = require('./exec')
const debug = require('debug')('attachments')

exports.downloadAttachment = (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send()
  res.download(path.resolve(datasetUtils.attachmentsDir(req.dataset), filePath))
}

exports.addAttachments = async (dataset, attachmentsArchive) => {
  const dir = datasetUtils.attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await exec('unzip', ['-o', '-q', attachmentsArchive.path, '-d', dir])
  await fs.remove(attachmentsArchive.path)
}

exports.replaceAllAttachments = async (dataset, attachmentsArchive) => {
  const dir = datasetUtils.attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await fs.emptyDir(dir)
  await exec('unzip', ['-o', '-q', attachmentsArchive.path, '-d', dir])
  await fs.remove(attachmentsArchive.path)
}

const storage = multer.diskStorage({
  destination: async function(req, file, cb) {
    try {
      const dir = datasetUtils.attachmentsDir(req.dataset)
      await fs.ensureDir(dir)
      cb(null, dir)
    } catch (err) {
      cb(err)
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})

const upload = multer({
  storage,
  fileFilter: async function fileFilter(req, file, cb) {
    try {
      // manage disk storage quota
      if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
      const contentLength = Number(req.get('Content-Length'))
      if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')
      // Approximate size of multi-part overhead and owner metadata
      const estimatedFileSize = contentLength - 210
      const attachmentLimit = config.defaultLimits.attachmentStorage
      if (attachmentLimit !== -1 && attachmentLimit < estimatedFileSize) throw createError(413, 'Attachment size exceeds the authorized limit')
      let storageRemaining = await datasetUtils.storageRemaining(req.app.get('db'), req.dataset.owner)
      if (storageRemaining !== -1) {
        // Ignore the size of the attachment we are overwriting
        const existingAttachment = (req.dataset.attachments || []).find(a => a.name === file.originalname)
        if (existingAttachment) storageRemaining += existingAttachment.size
        storageRemaining = Math.max(0, storageRemaining - estimatedFileSize)
        if (storageRemaining === 0) throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
      }
      // mime type is broken on windows it seems.. detect based on extension instead
      req.body.mimetype = mime.lookup(file.originalname)
      req.body.name = file.originalname
      debug('File accepted', file.originalname)
      cb(null, true)
    } catch (err) {
      debug('File rejected', err)
      cb(err)
    }
  }
})

exports.upload = () => upload.single('attachment')
