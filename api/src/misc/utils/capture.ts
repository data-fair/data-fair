import fs from 'fs-extra'
import config from '#config'
import path from 'path'
import axios from './axios.js'
import pump from './pipe.ts'
import * as rateLimiting from './rate-limiting.ts'
import debug from 'debug'
import * as permissionsUtils from './permissions.ts'
import resolvePath from 'resolve-path'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { RequestWithResource } from '#types'
import type { Response } from 'express'
import { type AxiosRequestConfig } from 'axios'

const captureUrl = config.privateCaptureUrl || config.captureUrl

const capturesDir = path.resolve(config.dataDir, 'captures')

export const init = async () => {
  await fs.ensureDir(capturesDir)
}

const screenshotRequestOpts = (req: RequestWithResource, isDefaultThumbnail = false): AxiosRequestConfig => {
  const screenshotUrl = (captureUrl + '/api/v1/screenshot')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.resource.id}`)
  if (isDefaultThumbnail) targetUrl.searchParams.set('thumbnail', 'true')
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('app_') && typeof req.query[key] === 'string') {
      targetUrl.searchParams.set(key.replace('app_', ''), req.query[key])
    }
  }
  debug(`Screenshot ${screenshotUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs: Record<string, string> = {
    target: targetUrl.href,
    type: 'png',
    width: '1050', // 21/9 resolution
    height: '450',
    filename: req.query.filename ? req.query.filename : ((req.resource.slug || req.resource.id) + '.png')
  }
  if (typeof req.query.width === 'string') qs.width = req.query.width
  if (typeof req.query.height === 'string') qs.height = req.query.height
  if (req.query.type === 'gif') qs.type = 'gif' // will return a gif if the application supports an animation mode, png otherwise
  if (req.query.timer === 'true') qs.timer = 'true'
  const headers: Record<string, string> = {}
  if (permissionsUtils.isPublic('applications', req.resource)) {
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
  const printUrl = (captureUrl + '/api/v1/print')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.resource.id}`)
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('app_')) targetUrl.searchParams.set(key.replace('app_', ''), req.query[key])
  }
  debug(`Print ${printUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs: Record<string, string> = {
    target: targetUrl.href,
    filename: req.query.filename ? req.query.filename : ((req.resource.slug || req.resource.id) + '.pdf')
  }
  if (req.query.landscape) qs.landscape = req.query.landscape
  const headers: Record<string, string> = {}
  if (permissionsUtils.isPublic('applications', req.resource)) {
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

const stream2file = async (reqOpts: AxiosRequestConfig, capturePath: string) => {
  let captureRes
  try {
    const captureReq = await axios({ ...reqOpts, responseType: 'stream' })
    await pump(captureReq.data, fs.createWriteStream(capturePath))
  } catch (err) {
    const data = await fs.readFile(capturePath, 'utf8')
    throw new Error(`failure in capture - ${captureRes.statusCode} - ${data}`)
  }
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
  } catch (err) {
    res.set('Cache-Control', 'no-cache')
    res.set('Expires', '-1')
    res.sendStatus(err.status || 500)
  }
}

export const screenshot = async (req: RequestWithResource, res: Response) => {
  if (config.noFS) {
    internalError('no-fs', 'tried to access captures directory')
    throw new Error('this service is configured without access to FS but this request requires it')
  }
  const capturePath = resolvePath(capturesDir, req.resource.id + '.png')

  const isDefaultThumbnail = Object.keys(req.query).filter(k => k !== 'updatedAt' && k !== 'app_capture-test-error').length === 0

  const reqOpts = screenshotRequestOpts(req, isDefaultThumbnail)

  if (isDefaultThumbnail) {
    if (await fs.pathExists(capturePath)) {
      const stats = await fs.stat(capturePath)
      if (req.resource.updatedAt && stats.mtime.toISOString() > req.resource.updatedAt) {
        res.set('x-capture-cache-status', 'HIT')
        return await new Promise((resolve, reject) => res.sendFile(
          capturePath,
          (err) => err ? reject(err) : resolve(true)
        ))
      } else {
        res.set('x-capture-cache-status', 'EXPIRED')
      }
    } else {
      res.set('x-capture-cache-status', 'MISS')
    }

    try {
      try {
        await stream2file(reqOpts, capturePath)
      } catch (err) {
        // we try twice as capture can have some stability issues
        await new Promise(resolve => setTimeout(resolve, 4000))
        await stream2file(reqOpts, capturePath)
      }
      return await new Promise((resolve, reject) => res.sendFile(
        capturePath,
        (err) => err ? reject(err) : resolve(true)
      ))
    } catch (err) {
      // catch err locally as this method is called without waiting for result

      internalError('app-thumbnail', err)

      // In case of error do not keep corrupted or empty file
      await fs.remove(capturePath)
      res.set('Cache-Control', 'no-cache')
      res.set('Expires', '-1')
      return res.redirect(req.publicBaseUrl + '/no-preview.png')
    }
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
