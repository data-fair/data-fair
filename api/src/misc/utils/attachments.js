import config from '#config'
import mongo from '#mongo'
import debugLib from 'debug'
import fs from 'fs-extra'
import multer from 'multer'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime-types'
import { metadataAttachmentsDir as datasetAttachmentsDir, metadataAttachmentPath as datasetAttachmentPath } from '../../datasets/utils/files.ts'
import { attachmentsDir as applicationAttachmentsDir, attachmentPath as applicationAttachmentPath } from '../../applications/utils.js'
import * as limits from './limits.js'

const debug = debugLib('attachments')
const debugLimits = debugLib('limits')

const metadataStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const dir = req.resourceType === 'applications' ? applicationAttachmentsDir(req.resource) : datasetAttachmentsDir(req.resource)
      await fs.ensureDir(dir)
      cb(null, dir)
    } catch (err) {
      cb(err)
    }
  },
  filename: async function (req, file, cb) {
    try {
      // creating empty file before streaming seems to fix some weird bugs with NFS
      const p = req.resourceType === 'applications' ? applicationAttachmentPath(req.resource, file.originalname) : datasetAttachmentPath(req.resource, file.originalname)
      await fs.ensureFile(p)
      cb(null, file.originalname)
    } catch (err) {
      cb(err)
    }
  }
})

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
      const remaining = await limits.remaining(mongo.db, req.resource.owner)
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
