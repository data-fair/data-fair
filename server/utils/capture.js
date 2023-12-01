const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const request = require('request')
const eventToPromise = require('event-to-promise')
const pump = require('../utils/pipe')
const requestIp = require('request-ip')
const rateLimiting = require('../utils/rate-limiting')
const debug = require('debug')('capture')
const permissionsUtils = require('./permissions')
const prometheus = require('./prometheus')

const captureUrl = config.privateCaptureUrl || config.captureUrl

exports.init = async () => {
  await fs.ensureDir(path.resolve(config.dataDir, 'captures'))
}

exports.pathDefault = async (application) => {
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.requestOpts = (req, isDefaultThumbnail) => {
  const screenShortUrl = (captureUrl + '/api/v1/screenshot')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.application.id}`)
  if (isDefaultThumbnail) targetUrl.searchParams.set('thumbnail', true)
  const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
  // forward query params to open application in specific state
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('app_')) targetUrl.searchParams.set(key.replace('app_', ''), req.query[key])
  }
  debug(`Screenshot ${screenShortUrl}?target=${encodeURIComponent(targetUrl)} - ${cookieText}`)

  const qs = {
    target: targetUrl.href,
    type: 'png',
    width: 1050, // 21/9 resolution
    height: 450,
    filename: req.application.id + '.png'
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
    url: screenShortUrl,
    qs,
    headers
  }
}

const stream2file = async (reqOpts, capturePath) => {
  let captureRes
  const captureReq = request(reqOpts)
  await Promise.all([
    eventToPromise(captureReq, 'response').then(r => { captureRes = r }),
    pump(captureReq, fs.createWriteStream(capturePath))
  ])
  if (captureRes.statusCode >= 400) {
    const data = await fs.readFile(capturePath, 'utf8')
    throw new Error(`failure in capture - ${captureRes.statusCode} - ${data}`)
  }
}

exports.screenshot = async (req, res) => {
  const capturePath = path.resolve(config.dataDir, 'captures', req.application.id + '.png')

  const isDefaultThumbnail = Object.keys(req.query).filter(k => k !== 'updatedAt' && k !== 'app_capture-test-error').length === 0

  const reqOpts = exports.requestOpts(req, isDefaultThumbnail)

  if (isDefaultThumbnail) {
    if (await fs.pathExists(capturePath)) {
      const stats = await fs.stat(capturePath)
      if (stats.mtime.toISOString() > req.resource.updatedAt) {
        res.set('x-capture-cache-status', 'HIT')
        return res.sendFile(capturePath)
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
      return res.sendFile(capturePath)
    } catch (err) {
      // catch err locally as this method is called without waiting for result
      console.warn(`(app-thumbnail) failed to capture screenshot for application ${req.application.id}`, err)
      prometheus.internalError.inc({ errorCode: 'app-thumbnail' })

      // In case of error do not keep corrupted or empty file
      await fs.remove(capturePath)
      res.set('Cache-Control', 'no-cache')
      res.set('Expires', '-1')
      return res.redirect(req.publicBaseUrl + '/no-preview.png')
    }
  } else {
    try {
      await rateLimiting.limiters.appCaptures.consume(req.user ? req.user.id : requestIp.getClientIp(req), 1)
    } catch (err) {
      return res.status(429).send(req.__('errors.exceedRateLimiting'))
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
