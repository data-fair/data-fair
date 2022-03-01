const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const request = require('request')
const pump = require('util').promisify(require('pump'))
const debug = require('debug')('capture')

const captureUrl = config.privateCaptureUrl || config.captureUrl

exports.init = async () => {
  await fs.ensureDir(path.resolve(config.dataDir, 'captures'))
}

exports.path = async (application) => {
  const gifPath = path.resolve(config.dataDir, 'captures', application.id + '.gif')
  if (await fs.exists(gifPath)) return gifPath
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.screenshot = async (req) => {
  const capturePath = path.resolve(config.dataDir, 'captures', req.application.id + '.png')

  try {
    const screenShortUrl = (captureUrl + '/api/v1/screenshot')
    const appUrl = `${config.publicUrl}/app/${req.application.id}`
    const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
    debug(`Screenshot ${screenShortUrl}?target=${appUrl} - ${cookieText}`)
    let res
    const reqOpts = {
      method: 'GET',
      url: screenShortUrl,
      qs: {
        target: appUrl,
        type: 'gif'
      },
      headers: {
        Cookie: cookieText
      }
    }

    try {
      res = request(reqOpts)
      await pump(res, fs.createWriteStream(capturePath))
    } catch (err) {
      // we try twice as capture can have some stability issues
      await new Promise(resolve => setTimeout(resolve, 4000))
      res = request(reqOpts)
      await pump(res, fs.createWriteStream(capturePath))
    }

    if (res.headers['content-type'] === 'image/gif') {
      await fs.move(capturePath, path.resolve(config.dataDir, 'captures', req.application.id + '.gif'))
    }
  } catch (err) {
    // catch err locally as this method is called without waiting for result
    console.error(`Failed to capture screenshot for application ${req.application.id}`, err)

    // In case of error do not keep corrupted or empty file
    await fs.remove(capturePath)
  }
}
