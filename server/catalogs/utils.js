const findUtils = require('../misc/utils/find')
const permissions = require('../misc/utils/permissions')
const { prepareMarkdownContent } = require('../misc/utils/markdown')

/**
 *
 * @param {any} catalog
 * @param {boolean} html
 * @returns {any}
 */
exports.clean = (catalog, html = false) => {
  catalog.public = permissions.isPublic('catalogs', catalog)
  delete catalog.permissions
  if (catalog.apiKey) catalog.apiKey = '**********'
  if (catalog.description) catalog.description = prepareMarkdownContent(catalog.description, html, null, `catalog:${catalog.id}`, catalog.updatedAt)
  findUtils.setResourceLinks(catalog, 'catalog', null, null, null)
  catalog.autoUpdate = catalog.autoUpdate || { active: false }
  return catalog
}
