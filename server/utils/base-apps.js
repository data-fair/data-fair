const marked = require('marked')

exports.clean = (publicUrl, baseApp, thumbnail, html = false) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version
  baseApp.description = baseApp.description || baseApp.meta.description || ''
  if (html) baseApp.description = marked.parse(baseApp.description)
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  const [width, height] = (thumbnail || '300x200').split('x')
  const thumbnailUrl = new URL(publicUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/thumbnail')
  if (width) thumbnailUrl.searchParams.set('width', width)
  if (height) thumbnailUrl.searchParams.set('height', height)
  baseApp.thumbnail = thumbnailUrl.href
  return baseApp
}
