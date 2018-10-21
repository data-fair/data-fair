const config = require('config')
const crypto = require('crypto')
const geoUtils = require('../geo')
const { aliasName } = require('./commons')

exports.esProperty = prop => {
  if (prop.type === 'object') return { type: 'object' }
  if (prop.type === 'integer') return { type: 'long' }
  if (prop.type === 'number') return { type: 'double' }
  if (prop.type === 'boolean') return { type: 'boolean' }
  if (prop.type === 'string' && prop.format === 'date-time') return { type: 'date' }
  if (prop.type === 'string' && prop.format === 'date') return { type: 'date' }
  // uri-reference and full text fields are managed in the same way from now on, because we want to be able to aggregate on small full text fields
  // TODO: maybe ignore_above should be only for uri-reference fields
  const textField = { type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: config.elasticsearch.defaultAnalyzer, fielddata: true } } }
  if (prop.type === 'string' && prop.format === 'uri-reference') return textField
  return textField
}

exports.indexDefinition = (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase))

  const properties = body.mappings.line.properties = {}
  dataset.schema.forEach(jsProp => {
    if (jsProp.key) {
      properties[jsProp.key] = exports.esProperty(jsProp)
      // Do not index geometry, it will copied and simplified in _geoshape
      if (jsProp['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') properties[jsProp.key].index = false
    }
  })

  // "hidden" fields for geo indexing (lat/lon in dataset or geojson data type)
  if (geoUtils.schemaHasGeopoint(dataset.schema) || geoUtils.schemaHasGeometry(dataset.schema)) {
    properties['_geopoint'] = { type: 'geo_point' }
    properties['_geoshape'] = { type: 'geo_shape' }
    properties['_geocorners'] = { type: 'geo_point' }
  }
  // "hidden" handy fields for sorting
  properties['_rand'] = { type: 'integer' }
  properties['_i'] = { type: 'integer' }
  return body
}

function indexPrefix(dataset) {
  return `${aliasName(dataset)}-${crypto.createHash('sha1').update(dataset.id).digest('hex').slice(0, 12)}`
}

exports.initDatasetIndex = async (client, dataset) => {
  const tempId = `${indexPrefix(dataset)}-${Date.now()}`
  const body = exports.indexDefinition(dataset)
  await client.indices.create({ index: tempId, body })
  return tempId
}

// this method will routinely throw errors
// we just try in case elasticsearch considers the new mapping compatible
// so that we might optimize and reindex only when necessary
exports.updateDatasetMapping = async (client, dataset) => {
  const index = aliasName(dataset)
  const body = exports.indexDefinition(dataset).mappings.line
  await client.indices.putMapping({ index, type: 'line', body })
}

exports.delete = async (client, dataset) => {
  await client.indices.deleteAlias({ name: aliasName(dataset), index: '_all' })
  await client.indices.delete({ index: `${indexPrefix(dataset)}-*` })
}

exports.switchAlias = async (client, dataset, tempId) => {
  const name = aliasName(dataset)
  // Delete all other indices from this dataset
  const previousIndices = await client.indices.get({ index: `${indexPrefix(dataset)}-*` })
  for (let key in previousIndices) {
    if (key !== tempId) await client.indices.delete({ index: key })
  }
  await client.indices.deleteAlias({ name, index: '_all', ignore: [404] })
  await client.indices.delete({ index: name, ignore: [404] })
  await client.indices.putAlias({ name, index: tempId })
}

const indexBase = {
  // Minimal overhead by default as we might deal with a lot of small indices.
  // TODO: a way to override this ? Maybe intelligently based on size of the file ?
  settings: { index: { number_of_shards: 1, number_of_replicas: 1 } },
  mappings: { line: {} }
}

exports.datasetInfos = async (client, dataset) => {
  // const indices = await client.indices.get({index: `${indexPrefix(dataset)}-*`})
  const indices = await client.cat.indices({ index: `${indexPrefix(dataset)}-*`, format: 'json' })
  for (let index of indices) {
    index.definition = await client.indices.get({ index: index.index })
  }
  const alias = await client.indices.getAlias({ index: aliasName(dataset) })
  return {
    aliasName: aliasName(dataset),
    indexPrefix: indexPrefix(dataset),
    indices,
    alias
  }
}
