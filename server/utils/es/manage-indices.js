const crypto = require('crypto')
const datasetUtils = require('../dataset')
const { aliasName, esProperty } = require('./commons')

exports.indexDefinition = (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase))
  const properties = body.mappings.properties = {}
  datasetUtils.extendedSchema(dataset).forEach(jsProp => {
    const esProp = esProperty(jsProp)
    if (esProp) properties[jsProp.key] = esProp
  })
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
  const body = exports.indexDefinition(dataset).mappings
  await client.indices.putMapping({ index, body })
}

exports.delete = async (client, dataset) => {
  await client.indices.deleteAlias({ name: aliasName(dataset), index: '_all' })
  await client.indices.delete({ index: `${indexPrefix(dataset)}-*` })
}

exports.switchAlias = async (client, dataset, tempId) => {
  const name = aliasName(dataset)
  // Delete all other indices from this dataset
  const previousIndices = await client.indices.get({ index: `${indexPrefix(dataset)}-*` })
  for (const key in previousIndices) {
    if (key !== tempId) await client.indices.delete({ index: key })
  }
  await client.indices.deleteAlias({ name, index: '_all', ignore: [404] })
  await client.indices.delete({ index: name, ignore: [404] })
  await client.indices.putAlias({ name, index: tempId })
}

const indexBase = {
  // Minimal overhead by default as we might deal with a lot of small indices.
  // TODO: a way to override this ? Maybe intelligently based on size of the file ?
  settings: {
    index: { number_of_shards: 1, number_of_replicas: 1 },
  },
  mappings: { },
}

exports.datasetInfos = async (client, dataset) => {
  // const indices = await client.indices.get({index: `${indexPrefix(dataset)}-*`})
  const indices = await client.cat.indices({ index: `${indexPrefix(dataset)}-*`, format: 'json' })
  for (const index of indices) {
    index.definition = await client.indices.get({ index: index.index })
  }
  const alias = await client.indices.getAlias({ index: aliasName(dataset) })
  return {
    aliasName: aliasName(dataset),
    indexPrefix: indexPrefix(dataset),
    indices,
    alias,
  }
}
