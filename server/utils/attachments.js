const fs = require('fs-extra')
const path = require('path')
const multer = require('multer')
const config = require('config')
const createError = require('http-errors')
const mime = require('mime-types')
const datasetUtils = require('./dataset')
const limits = require('./limits')
const exec = require('./exec')
const debug = require('debug')('attachments')

exports.downloadAttachment = (req, res, next) => {
  // no buffering of this response in the reverse proxy
  res.setHeader('X-Accel-Buffering', 'no')
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
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

exports.removeAll = async (dataset) => {
  await fs.remove(datasetUtils.attachmentsDir(dataset))
}

const metadataStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const dir = datasetUtils.metadataAttachmentsDir(req.dataset)
      await fs.ensureDir(dir)
      cb(null, dir)
    } catch (err) {
      cb(err)
    }
  },
  filename: async function (req, file, cb) {
    try {
      // creating empty file before streaming seems to fix some weird bugs with NFS
      await fs.ensureFile(path.join(datasetUtils.metadataAttachmentsDir(req.dataset), file.originalname))
      cb(null, file.originalname)
    } catch (err) {
      cb(err)
    }
  }
})

const metadataUpload = multer({
  storage: metadataStorage,
  fileFilter: async function fileFilter (req, file, cb) {
    try {
      // manage disk storage quota
      if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
      const contentLength = Number(req.get('Content-Length'))
      if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')
      // Approximate size of multi-part overhead and owner metadata
      const estimatedFileSize = contentLength - 210
      const attachmentLimit = config.defaultLimits.attachmentStorage
      if (attachmentLimit !== -1 && attachmentLimit < estimatedFileSize) throw createError(413, 'Attachment size exceeds the authorized limit')
      const remaining = await limits.remaining(req.app.get('db'), req.dataset.owner)
      if (remaining.storage !== -1) {
        // Ignore the size of the attachment we are overwriting
        const existingAttachment = (req.dataset.attachments || []).find(a => a.name === file.originalname)
        if (existingAttachment) remaining.storage += existingAttachment.size
        remaining.storage = Math.max(0, remaining.storage - estimatedFileSize)
        if (remaining.storage === 0) throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
      }
      // mime type is broken on windows it seems.. detect based on extension instead
      const mimeType = mime.lookup(file.originalname)
      if (mimeType) req.body.mimetype = mimeType
      req.body.name = file.originalname
      debug('File accepted', file.originalname)
      cb(null, true)
    } catch (err) {
      debug('File rejected', err)
      cb(err)
    }
  }
})

exports.metadataUpload = () => metadataUpload.single('attachment')
