const config = require('config')
const Thumbor = require('thumbor')

const thumbor = new Thumbor(config.thumbor.key, config.thumbor.url)

exports.thumbnail = (url, size, thumbnailsOpts = {}) => {
  if (!url) return null
  if (size === 'true' || size === '1') size = '300x200'
  size = size.split('x')

  // url can be given encoded or not, decoding should not hurt in any case
  url = decodeURI(url)
  // special case as thumbor does not create thumbnails of SVG images by default
  if (url.toLowerCase().endsWith('.svg')) return url
  // thumbor prefers resolving the scheme
  url = url.replace('http://', '').replace('https://', '')
  // url is encoded as a single URI param for thumbor
  url = encodeURIComponent(url)

  const instance = thumbor.setImagePath(url)
  if (thumbnailsOpts.resizeMode === 'fitIn') instance.fitIn(size[0], size[1])
  else instance.resize(size[0], size[1])
  if (thumbnailsOpts.resizeMode === 'smartCrop') instance.smartCrop(true)

  return instance.buildUrl()
}
