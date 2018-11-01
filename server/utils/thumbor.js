const config = require('config')
const Thumbor = require('thumbor')

const thumbor = new Thumbor(config.thumbor.key, config.thumbor.url)

exports.thumbnail = (url, size) => {
  size = size.split('x')
  return thumbor
    .setImagePath(url.replace('http://', '').replace('https://', ''))
    .resize(size[0], size[1])
    .buildUrl()
}
