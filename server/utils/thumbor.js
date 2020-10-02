const config = require('config')
const Thumbor = require('thumbor')

const thumbor = new Thumbor(config.thumbor.key, config.thumbor.url)

exports.thumbnail = (url, size, thumbnailsOpts = {}) => {
  if (!url) return null
  url = decodeURI(url)
  // special case as thumbor does not create thumbnails of SVG images by default
  if (url.toLowerCase().endsWith('.svg')) return url
  size = size.split('x')

  const instance = thumbor.setImagePath(url.replace('http://', '').replace('https://', ''))
  if (thumbnailsOpts.resizeMode === 'fitIn') instance.fitIn(size[0], size[1])
  else instance.resize(size[0], size[1])
  if (thumbnailsOpts.resizeMode === 'smartCrop') instance.smartCrop(true)

  return instance.buildUrl()
}
