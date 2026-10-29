import log from '@data-fair/lib-node/log.js'
import path from 'node:path'
import mime from 'mime-types'
import { type Request, type Response } from 'express'
import { pipeline } from 'node:stream/promises'
import filesStorage from './index.ts'
import contentDisposition from 'content-disposition'
import { dataDir, tmpDir } from '../datasets/utils/files.ts'
import slug from 'slugify'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

type DlFileOpts = {
  dispositionType?: 'inline' | 'attachment'
}

export const downloadFileFromStorage = async (filePath: string, req: Request, res: Response, opts: DlFileOpts = {}) => {
  // no stored file has control characters in its name, and some S3 providers answer such keys with a non-404 error
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(filePath)) throw httpError(404, 'file not found')
  const { body, size, lastModified, range } = await filesStorage.readStream(filePath, req.get('If-Modified-Since'), req.get('Range'))
  if (lastModified) res.set('Last-Modified', lastModified.toUTCString())
  if (size !== undefined) res.set('Content-Length', size + '')
  if (range) {
    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Range', range)
    res.status(206)
  } else {
    const { base, name, ext } = path.parse(filePath)
    const mimeType = mime.lookup(ext)
    if (mimeType) res.set('Content-Type', mimeType)

    // we have some cases where the content-disposition module doesn't apply a fallback while it probably should
    // or the problem lies in express, or somewhere else, anyway we have to force the fallback to also have a correct UTF-8 variant
    const cdOpts: contentDisposition.Options = { type: opts.dispositionType }
    let cd = contentDisposition(base, cdOpts)
    if (base !== encodeURIComponent(base) && !cd.includes('filename*=UTF-8\'')) {
      cdOpts.fallback = slug(name, { strict: true, replacement: ' ' }) + ext
      cd = contentDisposition(base, cdOpts)
    }
    res.set('Content-Disposition', cd)
  }

  // HEAD must return GET's headers (Content-Length, Last-Modified) with no body — streaming the
  // throttled body would hang until the file fully drains, timing out crawlers (e.g. hydra).
  if (req.method === 'HEAD') {
    body.destroy()
    res.end()
    return
  }

  try {
    // @ts-ignore
    if (res.throttle) await pipeline(body, res.throttle('static'), res)
    else await pipeline(body, res)
  } catch (err) {
    log.error('streaming failed', { code: 'files-storage-streaming', err })
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error')
    }
  }
}

export const isInFilesStorage = (filePath: string) => {
  if (filePath.startsWith(tmpDir)) return false
  if (filePath.startsWith(dataDir)) return true
  return false
}
