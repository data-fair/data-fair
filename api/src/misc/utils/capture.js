import fs from 'fs-extra'
import config from '#config'
import path from 'path'
import request from 'request'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import pump from '../utils/pipe.js'
import * as rateLimiting from '../utils/rate-limiting.js'
import debug from 'debug'
import * as permissionsUtils from './permissions.js'
import resolvePath from 'resolve-path'
import { internalError } from '@data-fair/lib-node/observer.js'

const captureUrl = config.privateCaptureUrl || config.captureUrl

const capturesDir = path.resolve(config.dataDir, 'captures')

export const init = async () => {
  await fs.ensureDir(capturesDir)
}

const screenshotRequestOpts = (req, isDefaultThumbnail) => {
  const screenshotUrl = (captureUrl + '/api/v1/screenshot')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.application.id}`)
  if (isDefaultThumbnail) targetUrl.searchParams.set('thumbnail', true)
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('app_')) targetUrl.searchParams.set(key.replace('app_', ''), req.query[key])
  }
  debug(`Screenshot ${screenshotUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs = {
    target: targetUrl.href,
    type: 'png',
    width: 1050, // 21/9 resolution
    height: 450,
    filename: req.query.filename ? req.query.filename : ((req.application.slug || req.application.id) + '.png')
  }
  if (req.query.width) qs.width = req.query.width
  if (req.query.height) qs.height = req.query.height
  if (req.query.type === 'gif') qs.type = 'gif' // will return a gif if the application supports an animation mode, png otherwise
  if (req.query.timer === 'true') qs.timer = true
  const headers = {}
  if (permissionsUtils.isPublic('applications', req.application)) {
    qs.cookies = false
  } else {
    headers.Cookie = cookieText
  }

  return {
    method: 'GET',
    url: screenshotUrl,
    qs,
    headers
  }
}

const printRequestOpts = (req) => {
  const printUrl = (captureUrl + '/api/v1/print')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.application.id}`)
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('app_')) targetUrl.searchParams.set(key.replace('app_', ''), req.query[key])
  }
  debug(`Print ${printUrl}?target=${encodeURIComponent(targetUrl.href)} - ${cookieText}`)

  const qs = {
    target: targetUrl.href,
    filename: req.query.filename ? req.query.filename : ((req.application.slug || req.application.id) + '.pdf')
  }
  if (req.query.landscape) qs.landscape = req.query.landscape
  const headers = {}
  if (permissionsUtils.isPublic('applications', req.application)) {
    qs.cookies = false
  } else {
    headers.Cookie = cookieText
  }

  return {
    method: 'GET',
    url: printUrl,
    qs,
    headers
  }
}

const stream2file = async (reqOpts, capturePath) => {
  let captureRes
  const captureReq = request(reqOpts)
  await Promise.all([
    eventPromise(captureReq, 'response').then(r => { captureRes = r }),
    pump(captureReq, fs.createWriteStream(capturePath))
  ])
  if (captureRes.statusCode >= 400) {
    const data = await fs.readFile(capturePath, 'utf8')
    throw new Error(`failure in capture - ${captureRes.statusCode} - ${data}`)
  }
}

export const screenshot = async (req, res) => {
  const capturePath = resolvePath(capturesDir, req.application.id + '.png')

  const isDefaultThumbnail = Object.keys(req.query).filter(k => k !== 'updatedAt' && k !== 'app_capture-test-error').length === 0

  const reqOpts = screenshotRequestOpts(req, isDefaultThumbnail)

  if (isDefaultThumbnail) {
    if (await fs.pathExists(capturePath)) {
      const stats = await fs.stat(capturePath)
      if (stats.mtime.toISOString() > req.resource.updatedAt) {
        res.set('x-capture-cache-status', 'HIT')
        await new Promise((resolve, reject) => res.sendFile(
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
      await stream2file(reqOpts, capturePath)
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
    const captureReq = request(reqOpts)
    captureReq.on('response', (captureRes) => {
      if (captureRes.statusCode >= 400) {
        res.set('Cache-Control', 'no-cache')
        res.set('Expires', '-1')
      }
    })
    await pump(captureReq, res)
  }
}

export const print = async (req, res) => {
  const reqOpts = printRequestOpts(req)

  if (!rateLimiting.consume(req, 'appCaptures')) {
    return res.status(429).type('text/plain').send(req.__('errors.exceedRateLimiting'))
  }
  const captureReq = request(reqOpts)
  captureReq.on('response', (captureRes) => {
    if (captureRes.statusCode >= 400) {
      res.set('Cache-Control', 'no-cache')
      res.set('Expires', '-1')
    }
  })
  await pump(captureReq, res)
}
