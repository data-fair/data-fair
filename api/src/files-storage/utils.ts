import { parse } from 'node:path'
import mime from 'mime-types'
import { type Request, type Response } from 'express'
import { pipeline } from 'node:stream/promises'
import filesStorage from './index.ts'
import contentDisposition from 'content-disposition'

type DlFileOpts = {
  dispositionType?: 'inline' | 'attachment'
}

export const downloadFileFromStorage = async (filePath: string, req: Request, res: Response, opts: DlFileOpts = {}) => {
  const { body, size, lastModified, range } = await filesStorage.readStream(filePath, req.get('If-Modified-Since'), req.get('Range'))
  if (lastModified) res.set('Last-Modified', lastModified.toUTCString())
  if (size !== undefined) res.set('Content-Length', size + '')
  if (range) {
    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Range', range)
    res.status(206)
  } else {
    const { base, ext } = parse(filePath)
    const mimeType = mime.lookup(ext)
    if (mimeType) res.set('Content-Type', mimeType)
    res.set('Content-Disposition', contentDisposition(base, { type: opts.dispositionType }))
  }

  try {
    // @ts-ignore
    if (res.throttle) await pipeline(body, res.throttle('static'), res)
    else await pipeline(body, res)
  } catch (err) {
    console.error('Streaming failed', err)
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error')
    }
  }
}
