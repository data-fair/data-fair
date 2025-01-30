import * as findUtils from '../misc/utils/find.js'
import * as permissions from '../misc/utils/permissions.js'
import { prepareMarkdownContent } from '../misc/utils/markdown.js'

/**
 *
 * @param {any} catalog
 * @param {boolean} html
 * @returns {any}
 */
export const clean = (catalog, html = false) => {
  catalog.public = permissions.isPublic('catalogs', catalog)
  delete catalog.permissions
  if (catalog.apiKey) catalog.apiKey = '**********'
  if (catalog.description) catalog.description = prepareMarkdownContent(catalog.description, html, null, `catalog:${catalog.id}`, catalog.updatedAt)
  findUtils.setResourceLinks(catalog, 'catalog', null, null, null)
  catalog.autoUpdate = catalog.autoUpdate || { active: false }
  return catalog
}
