import config from '#config'
import path from 'path'
import { randomUUID } from 'node:crypto'
// the capture service is part of our own infrastructure (configured url, not user input)
import { privateAxios as axios } from './axios.ts'
import pump from './pipe.ts'
import * as rateLimiting from './rate-limiting.ts'
import debug from 'debug'
import * as permissionsUtils from './permissions.ts'
import { reqResource } from './req-context.ts'
import { upstreamError } from './pseudo-session.ts'
import { setNoCache } from './cache-headers.ts'
import resolvePath from 'resolve-path'
import log from '@data-fair/lib-node/log.js'
import type { RequestWithResource } from '#types'
import type { Response } from 'express'
import { type AxiosRequestConfig } from 'axios'
import filesStorage from '#files-storage'
import { downloadFileFromStorage } from '../../files-storage/utils.ts'

const captureUrl = config.privateCaptureUrl || config.captureUrl

const capturesDir = path.resolve(config.dataDir, 'captures')

// path of the capture artifact for an application, used to clean it up when the application is deleted
export const captureFilePath = (application: { id: string }) => resolvePath(capturesDir, application.id + '.png')

/** The url of the application to render: its /app page, with the app_* query params forwarded as params of the application (to open it in a specific state) */
export const appTargetUrl = (id: string, query: Record<string, unknown>): URL => {
  const targetUrl = new URL(`${config.publicUrl}/app/${id}`)
  for (const key of Object.keys(query)) {
    if (key.startsWith('app_') && typeof query[key] === 'string') targetUrl.searchParams.set(key.replace('app_', ''), query[key])
  }
  return targetUrl
}

const screenshotRequestOpts = (req: RequestWithResource, isDefaultThumbnail = false): AxiosRequestConfig => {
  const resource = reqResource(req)
  const screenshotUrl = (captureUrl + '/api/v1/screenshot')
  const targetUrl = new URL(`${config.publicUrl}/app/${resource.id}`)
  if (isDefaultThumbnail) targetUrl.searchParams.set('thumbnail', 'true')
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const [key, value] of appTargetUrl(resource.id, req.query).searchParams) targetUrl.searchParams.set(key, value)
  debug(`Screenshot ${screenshotUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs: Record<string, string> = {
    target: targetUrl.href,
    type: 'png',
    width: '1050', // 21/9 resolution
    height: '450',
    filename: req.query.filename ? req.query.filename : ((resource.slug || resource.id) + '.png')
  }
  if (typeof req.query.width === 'string') qs.width = req.query.width
  if (typeof req.query.height === 'string') qs.height = req.query.height
  if (req.query.type === 'gif') qs.type = 'gif' // will return a gif if the application supports an animation mode, png otherwise
  if (req.query.timer === 'true') qs.timer = 'true'
  const headers: Record<string, string> = {}
  if (permissionsUtils.isPublic('applications', resource)) {
    qs.cookies = 'false'
  } else {
    headers.Cookie = cookieText
  }

  return {
    method: 'GET',
    url: screenshotUrl,
    params: qs,
    headers
  }
}

const printRequestOpts = (req: RequestWithResource): AxiosRequestConfig => {
  const resource = reqResource(req)
  const printUrl = (captureUrl + '/api/v1/print')
  const targetUrl = appTargetUrl(resource.id, req.query)
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  debug(`Print ${printUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs: Record<string, string> = {
    target: targetUrl.href,
    filename: req.query.filename ? req.query.filename : ((resource.slug || resource.id) + '.pdf')
  }
  if (req.query.landscape) qs.landscape = req.query.landscape
  const headers: Record<string, string> = {}
  if (permissionsUtils.isPublic('applications', resource)) {
    qs.cookies = 'false'
  } else {
    headers.Cookie = cookieText
  }

  return {
    method: 'GET',
    url: printUrl,
    params: qs,
    headers
  }
}

// a failed capture, with what the capture service answered
class CaptureError extends Error {
  status: number
  retryAfter?: number
  constructor (status: number, retryAfter?: number) {
    super(`failure in capture - ${status}`)
    this.status = status
    this.retryAfter = retryAfter
  }
}

const captureError = (err: any): CaptureError => {
  if (err instanceof CaptureError) return err
  const status = err.status ?? err.response?.status ?? 500
  const retryAfter = Number(err.response?.headers?.['retry-after'])
  return new CaptureError(status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
}

// the capture is written next to the thumbnail, then moved over it: a failed or partial capture
// never replaces (nor deletes) the previous thumbnail
const stream2file = async (reqOpts: AxiosRequestConfig, capturePath: string) => {
  const tmpPath = `${capturePath}.${randomUUID()}.tmp`
  try {
    const captureReq = await axios({ ...reqOpts, responseType: 'stream' })
    await filesStorage.writeStream(captureReq.data, tmpPath)
    await filesStorage.moveFile(tmpPath, capturePath)
  } catch (err: any) {
    await filesStorage.removeFile(tmpPath).catch(() => {})
    throw captureError(err)
  }
}

// a thumbnail that failed is not captured again for this long: without it every view of every
// page listing the application pays 2 captures and a pause, and loads the capture service
const failureTtl = 5 * 60 * 1000
const thumbnailFailures = new Map<string, { at: number, error: CaptureError }>()
// thumbnails being generated: concurrent requests for the same one share the capture
const thumbnailGenerations = new Map<string, Promise<void>>()

export const clearThumbnailFailures = () => thumbnailFailures.clear()

const recentFailure = (key: string) => {
  const failure = thumbnailFailures.get(key)
  if (!failure) return undefined
  if (Date.now() - failure.at > failureTtl) {
    thumbnailFailures.delete(key)
    return undefined
  }
  return failure.error
}

// 2 attempts, as capture can have some stability issues. A 4xx would fail again, an overloaded
// capture service (503) says when to come back
const generateThumbnail = async (reqOpts: AxiosRequestConfig, capturePath: string) => {
  try {
    await stream2file(reqOpts, capturePath)
  } catch (err: any) {
    const error = captureError(err)
    if (error.status >= 400 && error.status < 500) throw error
    const wait = error.status === 503 && error.retryAfter ? Math.min(error.retryAfter * 1000, 10000) : 4000
    await new Promise(resolve => setTimeout(resolve, wait))
    await stream2file(reqOpts, capturePath)
  }
}

const sharedThumbnailGeneration = (key: string, reqOpts: AxiosRequestConfig, capturePath: string) => {
  let generation = thumbnailGenerations.get(key)
  if (!generation) {
    generation = generateThumbnail(reqOpts, capturePath)
      .catch((err) => {
        const error = captureError(err)
        thumbnailFailures.set(key, { at: Date.now(), error })
        log.error('failed to capture an application thumbnail', { code: 'app-thumbnail', status: error.status, err })
        throw error
      })
      .finally(() => thumbnailGenerations.delete(key))
    thumbnailGenerations.set(key, generation)
  }
  return generation
}

const stream2req = async (reqOpts: AxiosRequestConfig, res: Response) => {
  try {
    const captureReq = await axios({ ...reqOpts, responseType: 'stream' })
    res.status(captureReq.status)
    for (const header in captureReq.headers) {
      const value = captureReq.headers[header]
      res.setHeader(header, value)
    }
    await pump(captureReq.data, res)
  } catch (err: any) {
    res.set('Cache-Control', 'no-cache')
    res.set('Expires', '-1')
    res.sendStatus(err.status || 500)
  }
}

export const screenshot = async (req: RequestWithResource, res: Response) => {
  const resource = reqResource(req)
  const capturePath = resolvePath(capturesDir, resource.id + '.png')

  const isDefaultThumbnail = Object.keys(req.query).filter(k => k !== 'updatedAt' && k !== 'app_capture-test-error').length === 0

  const reqOpts = screenshotRequestOpts(req, isDefaultThumbnail)

  if (isDefaultThumbnail) {
    const exists = await filesStorage.fileExists(capturePath)
    if (exists) {
      const stats = await filesStorage.fileStats(capturePath)
      if (resource.updatedAt && Math.floor(stats.lastModified.getTime() / 1000) >= Math.floor(new Date(resource.updatedAt).getTime() / 1000)) {
        res.set('x-capture-cache-status', 'HIT')
        return await downloadFileFromStorage(capturePath, req, res)
      }
    }

    const key = `${resource.id}:${resource.updatedAt}`
    let error = recentFailure(key)
    if (!error) {
      try {
        await sharedThumbnailGeneration(key, reqOpts, capturePath)
        res.set('x-capture-cache-status', exists ? 'EXPIRED' : 'MISS')
        return await downloadFileFromStorage(capturePath, req, res)
      } catch (err) {
        error = captureError(err)
      }
    }

    // the capture failed, now or a few minutes ago: never cached, so that the next view retries
    setNoCache(req, res)
    if (exists) {
      // the previous thumbnail, better than nothing
      res.set('x-capture-cache-status', 'STALE')
      return await downloadFileFromStorage(capturePath, req, res)
    }
    // an error status, not an image: an <img> fires its error event and the clients show their
    // fallback (the portals move on to the next image of the card)
    res.set('x-capture-cache-status', 'ERROR')
    if (error.status === 503) {
      res.set('Retry-After', String(error.retryAfter ?? Math.ceil(failureTtl / 1000)))
      return res.status(503).type('text/plain').send('the capture service is overloaded, retry later')
    }
    return res.status(502).type('text/plain').send(`the capture of the application failed (${error.status})`)
  } else {
    if (!rateLimiting.consume(req, 'appCaptures')) {
      return res.status(429).type('text/plain').send(req.__('errors.exceedRateLimiting'))
    }
    res.set('x-capture-cache-status', 'BYPASS')
    await stream2req(reqOpts, res)
  }
}

export const print = async (req: RequestWithResource, res: Response) => {
  const reqOpts = printRequestOpts(req)

  if (!rateLimiting.consume(req, 'appCaptures')) {
    return res.status(429).type('text/plain').send(req.__('errors.exceedRateLimiting'))
  }
  await stream2req(reqOpts, res)
}

/**
 * Renders a page as the owner of the cookie, internal only: returns a screenshot and a report of what was rendered.
 * The capture service is configured to only render pages of our own host.
 */
// declaredErrorUrl: where the page POSTs the errors it detects itself, capture reports them instead of sending them
export const inspect = async (target: string, cookie: string, opts: { mobile: boolean, fullPage: boolean, declaredErrorUrl?: string }): Promise<{ image: { data: string, mediaType: string }, text: string, report: Record<string, unknown> }> => {
  try {
    const res = await axios.get(captureUrl + '/api/v1/inspect', {
      params: { target, mobile: String(opts.mobile), fullPage: String(opts.fullPage), ...(opts.declaredErrorUrl ? { declaredErrorUrl: opts.declaredErrorUrl } : {}) },
      // the SECRET_INSPECT of the capture service, it only opens /inspect (assertPreviewConfigured checked it is set)
      headers: { 'x-secret-key': config.secretKeys.capture as string, Cookie: cookie },
      timeout: 60000
    })
    return res.data
  } catch (err: any) {
    throw upstreamError('the capture service', err)
  }
}
