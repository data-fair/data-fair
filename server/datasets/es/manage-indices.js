const crypto = require('crypto')
const config = require('config')
const datasetUtils = require('../utils')
const { aliasName, esProperty } = require('./commons')

exports.indexDefinition = async (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase(dataset)))
  const properties = body.mappings.properties = {}
  for (const jsProp of await datasetUtils.extendedSchema(null, dataset, false)) {
    const esProp = esProperty(jsProp)
    if (esProp) {
      if (jsProp['x-extension'] && dataset.extensions && dataset.extensions.find(e => e.type === 'remoteService' && jsProp['x-extension'] === e.remoteService + '/' + e.action)) {
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
exports.updateDatasetMapping = async (client, dataset, oldDataset) => {
  const index = aliasName(dataset)
  const newMapping = (await exports.indexDefinition(dataset)).mappings
  if (oldDataset) {
    // new inner fields do not trigger an error in ES but they are ignored if we don't fully reindex
    const oldMapping = (await exports.indexDefinition(oldDataset)).mappings
    for (const key of Object.keys(oldMapping.properties)) {
      const oldProperty = oldMapping.properties[key]
      const newProperty = newMapping.properties[key]
      if (newProperty && newProperty.fields) {
        for (const innerKey of Object.keys(newProperty.fields)) {
          if (!(oldProperty.fields && oldProperty.fields[innerKey])) {
            throw new Error(`the inner field ${key}/${innerKey} is added, simple mapping update will not work`)
          }
        }
      }
    }
  }
  await client.indices.putMapping({ index, body: newMapping })
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
  /* try {
    await client.indices.deleteAlias({ name, index: '_all' })
  } catch (err) {
    if (err.message !== 'aliases_not_found_exception') throw new Error(err)
  }
  await client.indices.delete({ index: name, ignore_unavailable: true }) */
  await client.indices.putAlias({ name, index: tempId })
}

const getNbShards = (dataset) => {
  return Math.max(1, Math.ceil((dataset.storage?.indexed?.size || 0) / config.elasticsearch.maxShardSize))
}

const indexBase = (dataset) => {
  const nbShards = getNbShards(dataset)
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
        },
        filter: {
          french_elision: {
            type: 'elision',
            articles_case: true,
            articles: [
              'l', 'm', 't', 'qu', 'n', 's',
              'j', 'd', 'c', 'jusqu', 'quoiqu',
              'lorsqu', 'puisqu'
            ]
          },
          french_stop: {
            type: 'stop',
            stopwords: '_french_'
          },
          french_stemmer: {
            type: 'stemmer',
            language: 'light_french'
          }
        },
        analyzer: {
          // copy of https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html#french-analyzer
          // but insensitive to diacritics
          custom_french: {
            tokenizer: 'standard',
            filter: [
              'french_elision',
              'lowercase',
              'french_stop',
              'french_stemmer',
              'asciifolding'
            ]
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
    index.definition = (await client.indices.get({ index: index.index })).body[index.index]
  }
  const alias = (await client.indices.getAlias({ index: aliasName(dataset) })).body
  const aliasedIndexName = Object.keys(alias ?? {})[0]
  const index = indices.find(index => index.index === aliasedIndexName)
  return {
    aliasName: aliasName(dataset),
    indexPrefix: indexPrefix(dataset),
    indices,
    alias,
    index
  }
}

exports.datasetWarning = async (client, dataset) => {
  if (dataset.isVirtual || dataset.isMetaOnly || dataset.status === 'draft') return null
  const esInfos = await exports.datasetInfos(client, dataset)
  if (!esInfos.index) return 'MissingIndex'
  else if (esInfos.index.health === 'red') return 'IndexHealthRed'
  else if (!esInfos.index.definition?.settings?.index?.number_of_shards) return 'MissingIndexSettings'
  else {
    const nbShards = Number(esInfos.index.definition.settings.index.number_of_shards)
    const recommendedNbShards = getNbShards(dataset)
    if (recommendedNbShards !== nbShards) return 'ShardingRecommended'
  }
  return null
}
