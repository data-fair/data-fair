const marked = require('marked')
const thumbor = require('../utils/thumbor')

exports.clean = (baseApp, thumbnail, html = false) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version
  baseApp.description = baseApp.description || baseApp.meta.description || ''
  if (html) baseApp.description = marked(baseApp.description)
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  baseApp.thumbnail = thumbor.thumbnail(baseApp.image, thumbnail || '300x200')
  return baseApp
}
