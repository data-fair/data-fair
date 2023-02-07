const marked = require('marked')
const { prepareThumbnailUrl } = require('./thumbnails')

exports.clean = (publicUrl, baseApp, thumbnail, html = false) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version
  baseApp.description = baseApp.description || baseApp.meta.description || ''
  if (html) baseApp.description = marked.parse(baseApp.description)
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  baseApp.thumbnail = prepareThumbnailUrl(publicUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/thumbnail', thumbnail)
  return baseApp
}
