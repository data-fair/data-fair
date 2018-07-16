const fs = require('fs')
const assert = require('assert')
const createError = require('http-errors')

// Dynamic loading of all modules in the current directory
exports.connectors = fs.readdirSync(__dirname)
  .filter(f => f !== 'index.js')
  .map(f => ({key: f.replace('.js', ''), ...require('./' + f)}))

// Loosely validate connectors
const expectedKeys = ['key', 'title', 'description', 'docUrl', 'init', 'findOrganizations']
exports.connectors.forEach(c => {
  assert.deepEqual(Object.keys(c), expectedKeys, `The catalog connector ${c.key} does not have all expected exported properties (${expectedKeys.join(', ')}).`)
})

exports.init = async (catalogUrl) => {
  for (let connector of exports.connectors) {
    try {
      const catalog = await connector.init(catalogUrl)
      catalog.type = connector.key
      return catalog
    } catch (err) {
      // Nothing.. an error simply means that this connector is not the right one
    }
  }
}

exports.findOrganizations = async (type, url, q) => {
  const connector = exports.connectors.find(c => c.key === type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + type)
  return connector.findOrganizations(url, q)
}
