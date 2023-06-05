const crypto = require('crypto')
const config = require('config')
const datasetUtils = require('../dataset')
const { aliasName, esProperty } = require('./commons')

exports.indexDefinition = async (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase(dataset)))
  const properties = body.mappings.properties = {}
  for (const jsProp of await datasetUtils.extendedSchema(null, dataset, false)) {
    const esProp = esProperty(jsProp)
    if (esProp) {
      if (jsProp['x-extension']) {
        const extKey = jsProp.key.split('.')[0]
        properties[extKey] = properties[extKey] || { dynamic: 'strict', properties: {} }
        properties[extKey].properties[jsProp.key.replace(extKey + '.', '')] = esProp
      } else {
        properties[jsProp.key] = esProp
      }
    }
  }
  return body
}

function indexPrefix (dataset) {
  return `${aliasName(dataset)}-${crypto.createHash('sha1').update(dataset.id).digest('hex').slice(0, 12)}`
}

exports.initDatasetIndex = async (client, dataset) => {
  const tempId = `${indexPrefix(dataset)}-${Date.now()}`
  const body = await exports.indexDefinition(dataset)
  await client.indices.create({ index: tempId, body })
  return tempId
}

// this method will routinely throw errors
// we just try in case elasticsearch considers the new mapping compatible
// so that we might optimize and reindex only when necessary
exports.updateDatasetMapping = async (client, dataset) => {
  const index = aliasName(dataset)
  const body = (await exports.indexDefinition(dataset)).mappings
  await client.indices.putMapping({ index, body })
}

exports.delete = async (client, dataset) => {
  await client.indices.deleteAlias({ name: aliasName(dataset), index: '_all' })
  await client.indices.delete({ index: `${indexPrefix(dataset)}-*` })
}

exports.switchAlias = async (client, dataset, tempId) => {
  const name = aliasName(dataset)
  // Delete all other indices from this dataset
  const previousIndices = await client.indices.get({ index: `${indexPrefix(dataset)}-*`, ignore_unavailable: true })
  for (const key in previousIndices.body) {
    if (key !== tempId) await client.indices.delete({ index: key })
  }
  try {
    await client.indices.deleteAlias({ name, index: '_all' })
  } catch (err) {
    if (err.message !== 'aliases_not_found_exception') throw new Error(err)
  }
  await client.indices.delete({ index: name, ignore_unavailable: true })
  await client.indices.putAlias({ name, index: tempId })
}

const indexBase = (dataset) => {
  const nbShards = dataset.file ? Math.max(1, Math.ceil(dataset.file.size / config.elasticsearch.maxShardSize)) : 1
  return {
    settings: {
      index: {
        'mapping.total_fields.limit': 3000,
        number_of_shards: nbShards,
        number_of_replicas: config.elasticsearch.nbReplicas
      },
      analysis: {
        normalizer: {
          // sorting ignores case and diacritics variations
          insensitive_normalizer: {
            type: 'custom',
            filter: ['lowercase', 'asciifolding']
          }
        }
      }
    },
    mappings: { dynamic: 'strict' }
  }
}

exports.datasetInfos = async (client, dataset) => {
  // const indices = await client.indices.get({index: `${indexPrefix(dataset)}-*`})
  const indices = (await client.cat.indices({ index: `${indexPrefix(dataset)}-*`, format: 'json' })).body
  for (const index of indices) {
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
