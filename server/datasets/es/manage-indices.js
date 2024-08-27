const crypto = require('crypto')
const config = require('config')
const datasetUtils = require('../utils')
const metrics = require('../../misc/utils/metrics')
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
  return `${config.indicesPrefix}-${dataset.id}-${crypto.createHash('sha1').update(dataset.id).digest('hex').slice(0, 12)}`
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

const getAliases = async (client, dataset) => {
  let prodAlias
  try {
    prodAlias = (await client.indices.getAlias({ name: aliasName({ ...dataset, draftReason: null }) })).body
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  let draftAlias
  try {
    draftAlias = (await client.indices.getAlias({ name: aliasName({ ...dataset, draftReason: true }) })).body
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  return { prodAlias, draftAlias }
}

// delete indices and aliases of a dataset
exports.delete = async (client, dataset) => {
  const { prodAlias } = await getAliases(client, dataset)

  if (dataset.draftReason) {
    // in case of a draft dataset, delete all indices not used by the production alias
    const previousIndices = await client.indices.get({ index: `${indexPrefix(dataset)}-*`, ignore_unavailable: true })
    for (const index in previousIndices.body) {
      if (prodAlias && prodAlias[index]) continue
      await client.indices.delete({ index })
    }
  } else {
    await client.indices.delete({ index: `${indexPrefix(dataset)}-*` })
  }
}

// replace the index referenced by a dataset's alias
exports.switchAlias = async (client, dataset, tempId) => {
  const name = aliasName(dataset)
  await client.indices.updateAliases({
    body: {
      actions: [
        { remove: { alias: name, index: '*' } },
        { add: { alias: name, index: tempId } }
      ]
    }
  })

  // Delete indices of this dataset that are not referenced by either the draft or prod aliases
  const { prodAlias, draftAlias } = await getAliases(client, dataset)
  const indices = await client.indices.get({ index: `${indexPrefix(dataset)}-*`, ignore_unavailable: true })
  for (const index in indices.body) {
    if (prodAlias && prodAlias[index]) continue
    if (draftAlias && draftAlias[index]) continue
    await client.indices.delete({ index })
  }
}

// move an index from the draft alias to the production alias
exports.validateDraftAlias = async (client, dataset, tempId) => {
  const { draftAlias } = await getAliases(client, dataset)
  if (!draftAlias || Object.keys(draftAlias).length !== 1) throw new Error('no draft alias to validate')
  await client.indices.deleteAlias({ name: aliasName({ ...dataset, draftReason: true }), index: '_all' })
  await exports.switchAlias(client, { ...dataset, draftReason: null }, Object.keys(draftAlias)[0])
}

const getNbShards = (dataset) => {
  return Math.max(1, Math.ceil((dataset.storage?.indexed?.size || 0) / config.elasticsearch.maxShardSize))
}

const indexBase = (dataset) => {
  const nbShards = getNbShards(dataset)
  /** @type {any} */
  const indexSettings = {
    'mapping.total_fields.limit': 3000,
    number_of_shards: nbShards,
    number_of_replicas: config.elasticsearch.nbReplicas
  }
  // used for testing
  if (process.env.READ_ONLY_ES_INDEX === 'true') {
    indexSettings['blocks.read_only_allow_delete'] = true
  }
  return {
    settings: {
      index: indexSettings,
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
  if (dataset.isVirtual || dataset.isMetaOnly || dataset.status === 'draft' || dataset.status === 'error') return null
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
