const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const request = require('request')
const pump = require('util').promisify(require('pump'))

exports.path = (application) => {
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.screenshot = async (req) => {
  try {
    const cookieText = Object.keys(req.cookies).map(c => `${c}=${req.cookies[c]}`).join('; ')
    const res = await request({
      method: 'GET',
      url: config.captureUrl + '/api/v1/screenshot',
      qs: {
        target: `${config.publicUrl}/app/${req.application.id}`
      },
      headers: {
        Cookie: cookieText
      }
    })
    await pump(res, fs.createWriteStream(exports.path(req.application)))
  } catch (err) {
    // catch err locally as this method is called without waiting for result
    console.error(`Failed to capture screenshot for application ${req.application.id}`, err)
  }
}
