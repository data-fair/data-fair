const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const request = require('request')
const pump = require('util').promisify(require('pump'))
const debug = require('debug')('capture')

const captureUrl = config.privateCaptureUrl || config.captureUrl

exports.init = async () => {
  console.log('init')
  await fs.ensureDir(path.resolve(config.dataDir, 'captures'))
}

exports.pathDefault = async (application) => {
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.requestOpts = (req) => {
  const screenShortUrl = (captureUrl + '/api/v1/screenshot')
  const targetUrl = new URL(`${config.publicUrl}/app/${req.application.id}`)
  targetUrl.searchParams.set('thumbnail', true) // the thumbnail query param can be used by the application to render something adapted to the context
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

  return {
    method: 'GET',
    url: screenShortUrl,
    qs,
    headers: {
      Cookie: cookieText
    }
  }
}

exports.screenshot = async (req, res) => {
  const capturePath = path.resolve(config.dataDir, 'captures', req.application.id + '.png')

  const reqOpts = exports.requestOpts(req)

  if (Object.keys(req.query).filter(k => k !== 'updatedAt').length === 0) {
    if (await fs.pathExists(capturePath)) {
      const stats = await fs.stat(capturePath)
      if (stats.mtime.toISOString() > req.resource.fullUpdatedAt) {
        res.set('x-capture-cache-status', 'HIT')
        return res.sendFile(capturePath)
      } else {
        res.set('x-capture-cache-status', 'EXPIRED')
      }
    } else {
      res.set('x-capture-cache-status', 'MISS')
    }

    try {
      let captureRes
      try {
        captureRes = request(reqOpts)
        await pump(captureRes, fs.createWriteStream(capturePath))
      } catch (err) {
      // we try twice as capture can have some stability issues
        await new Promise(resolve => setTimeout(resolve, 4000))
        captureRes = request(reqOpts)
        await pump(captureRes, fs.createWriteStream(capturePath))
      }

      if (captureRes.headers['content-type'] === 'image/gif') {
        await fs.move(capturePath, path.resolve(config.dataDir, 'captures', req.application.id + '.gif'))
      }
      return res.sendFile(capturePath)
    } catch (err) {
      // catch err locally as this method is called without waiting for result
      console.warn(`Failed to capture screenshot for application ${req.application.id}`, err)

      // In case of error do not keep corrupted or empty file
      await fs.remove(capturePath)
      return res.redirect(req.publicBaseUrl + '/no-preview.png')
    }
  } else {
    res.set('x-capture-cache-status', 'BYPASS')
    await pump(request(reqOpts), res)
  }
}
