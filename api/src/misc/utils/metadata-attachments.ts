import config from '#config'
import path from 'node:path'
import debugLib from 'debug'
import multer from 'multer'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime-types'
import { metadataAttachmentsDir as datasetAttachmentsDir } from '../../datasets/utils/files.ts'
import { attachmentsDir as applicationAttachmentsDir } from '../../applications/utils.ts'
import * as limits from './limits.ts'
import filesStorage from '#files-storage'

const debug = debugLib('attachments')
const debugLimits = debugLib('limits')

// inspired by https://github.com/expressjs/multer/blob/main/storage/disk.js
// but uses our files storage abstraction
const metadataStorage = {
  async _handleFile (req: any, file: any, cb: (err?: any, file?: any) => void) {
    try {
      const destination = req.resourceType === 'applications' ? applicationAttachmentsDir(req.resource) : datasetAttachmentsDir(req.resource)
      const filename = file.originalname
      const finalPath = path.join(destination, filename)
      await filesStorage.writeStream(file.stream, finalPath)
      const stats = await filesStorage.fileStats(finalPath)
      cb(null, {
        destination,
        filename,
        path: finalPath,
        size: stats.size
      })
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
      await filesStorage.removeFile(path)
      cb()
    } catch (err) {
      cb(err)
    }
  }
}

const metadataUploadMulter = multer({
  storage: metadataStorage,
  fileFilter: async function fileFilter (req, file, cb) {
    try {
      // manage disk storage quota
      if (!req.get('Content-Length')) throw httpError(411, 'Content-Length is mandatory')
      const contentLength = Number(req.get('Content-Length'))
      if (Number.isNaN(contentLength)) throw httpError(400, 'Content-Length is not a number')
      // Approximate size of multi-part overhead and owner metadata
      const estimatedFileSize = contentLength - 210
      const attachmentLimit = config.defaultLimits.attachmentStorage
      if (attachmentLimit !== -1 && attachmentLimit < estimatedFileSize) {
        debugLimits('attachmentStorage/metadataUpload', { attachmentLimit, estimatedFileSize })
        throw httpError(413, 'Attachment size exceeds the authorized limit')
      }
      const remaining = await limits.remaining(req.resource.owner)
      const debugInfo = { owner: req.resource.owner, remaining: { ...remaining }, estimatedFileSize }
      if (remaining.storage !== -1) {
        // Ignore the size of the attachment we are overwriting
        const existingAttachment = (req.resource.attachments || []).find(a => a.name === file.originalname)
        if (existingAttachment) {
          remaining.storage += existingAttachment.size
          debugInfo.existingAttachment = existingAttachment
        }
        remaining.storage = Math.max(0, remaining.storage - estimatedFileSize)
        if (remaining.storage === 0) {
          debugLimits('exceedLimitStorage/metadataUpload', debugInfo)
          throw httpError(429, req.__('errors.exceedLimitStorage'))
        }
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

export const metadataUpload = () => metadataUploadMulter.single('attachment')
