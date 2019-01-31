const thumbor = require('../utils/thumbor')

exports.clean = (baseApp, thumbnail) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version
  baseApp.description = baseApp.description || baseApp.meta.description
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  baseApp.thumbnail = thumbor.thumbnail(baseApp.image, thumbnail || '300x200')
  return baseApp
}
