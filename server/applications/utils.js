const visibilityUtils = require('../misc/utils/visibility')
const permissions = require('../misc/utils/permissions')
const { prepareMarkdownContent } = require('../misc/utils/markdown')
const findUtils = require('../misc/utils/find')

exports.clean = (application, publicUrl, publicationSite, query = {}) => {
  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    if (!select.includes('-public')) application.public = permissions.isPublic('applications', application)
    if (!select.includes('-visibility')) application.visibility = visibilityUtils.visibility(application)
    if (!query.select || select.includes('description')) {
      application.description = application.description || ''
      application.description = prepareMarkdownContent(application.description, query.html === 'true', query.truncate, 'application:' + application.id, application.updatedAt)
    }
    if (!select.includes('-links')) findUtils.setResourceLinks(application, 'application', publicUrl, publicationSite && publicationSite.applicationUrlTemplate)
  }

  delete application.permissions
  delete application._id
  delete application.configuration
  delete application.configurationDraft
  if (select.includes('-userPermissions')) delete application.userPermissions
  if (select.includes('-owner')) delete application.owner
  delete application._uniqueRefs
  return application
}
