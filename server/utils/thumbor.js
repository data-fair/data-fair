const config = require('config')
const Thumbor = require('thumbor')

const thumbor = new Thumbor(config.thumbor.key, config.thumbor.url)

exports.thumbnail = (url, size, thumbnailsOpts = {}) => {
  if (!url) return null
  url = encodeURI(decodeURI(url))
  if (size === 'true' || size === '1') size = '300x200'
  // special case as thumbor does not create thumbnails of SVG images by default
  if (url.toLowerCase().endsWith('.svg')) return url
  size = size.split('x')

  const instance = thumbor.setImagePath(url.replace('http://', '').replace('https://', ''))
  if (thumbnailsOpts.resizeMode === 'fitIn') instance.fitIn(size[0], size[1])
  else instance.resize(size[0], size[1])
  if (thumbnailsOpts.resizeMode === 'smartCrop') instance.smartCrop(true)

  return instance.buildUrl()
}
