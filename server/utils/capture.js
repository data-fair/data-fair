const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const request = require('request')
const pump = require('util').promisify(require('pump'))
const debug = require('debug')('capture')
exports.init = async() => {
  await fs.ensureDir(path.resolve(config.dataDir, 'captures'))
}

exports.path = (application) => {
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.screenshot = async (req) => {
  try {
    const screenShortUrl = (config.captureUrl + '/api/v1/screenshot')
    const appUrl = `${config.publicUrl}/app/${req.application.id}`
    const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
    debug(`Screenshot ${screenShortUrl}?target=${appUrl} - ${cookieText}`)
    let res
    const reqOpts = {
      method: 'GET',
      url: screenShortUrl,
      qs: {
        target: appUrl
      },
      headers: {
        Cookie: cookieText
      }
    }

    try {
      res = request(reqOpts)
      await pump(res, fs.createWriteStream(exports.path(req.application)))
    } catch (err) {
      // we try twice as capture can have some stability issues
      await new Promise(resolve => setTimeout(resolve, 4000))
      res = request(reqOpts)
      await pump(res, fs.createWriteStream(exports.path(req.application)))
    }
  } catch (err) {
    // catch err locally as this method is called without waiting for result
    console.error(`Failed to capture screenshot for application ${req.application.id}`, err)
  }
}
