import crypto from 'crypto'
import config from '#config'
import es from '#es'
import * as datasetUtils from '../utils/index.ts'
import { aliasName } from './commons.ts'
import { buildIndexMappings } from './operations.ts'
import { computeFinalizeWarnings, pickPrimaryCode, computeIgnoredKeywordFields, type WarningCode } from './diagnose-warnings.ts'
import { internalError } from '@data-fair/lib-node/observer.js'
import debugModule from 'debug'

const debug = debugModule('manage-indices')

export const indexDefinition = async (dataset: any) => {
  const body = JSON.parse(JSON.stringify(indexBase(dataset)))
  const jsProps = await datasetUtils.extendedSchema(null, dataset, false)
  body.mappings.properties = buildIndexMappings(dataset, jsProps, config.elasticsearch.defaultAnalyzer).properties
  return body
}

export function indexPrefix (dataset: any) {
  return `${config.indicesPrefix}-${dataset.id}-${crypto.createHash('sha1').update(dataset.id).digest('hex').slice(0, 12)}`
}

export const initDatasetIndex = async (dataset: any) => {
  const tempId = `${indexPrefix(dataset)}-${Date.now()}`
  const body = await indexDefinition(dataset)
  const res = await es.client.indices.create({
    index: tempId,
    body,
    timeout: '60s'
  })
  if (!res.acknowledged) throw new Error('failed to get cluster acknowledgement after creating index ' + tempId)
  return tempId
}

// this method will routinely throw errors
// we just try in case elasticsearch considers the new mapping compatible
// so that we might optimize and reindex only when necessary
export const updateDatasetMapping = async (dataset: any, oldDataset?: any) => {
  const index = aliasName(dataset)
  const newMapping = (await indexDefinition(dataset)).mappings
  if (oldDataset) {
    // new inner fields do not trigger an error in ES but they are ignored if we don't fully reindex
    const oldMapping = (await indexDefinition(oldDataset)).mappings
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
      // copy_to is not updatable on an existing field, and existing rows are not re-copied;
      // a changed copy_to (e.g. the dataset dropping below the "wide" threshold) only takes
      // effect on a full reindex -> force one
      if (newProperty && JSON.stringify([].concat(oldProperty.copy_to ?? []).sort()) !== JSON.stringify([].concat(newProperty.copy_to ?? []).sort())) {
        throw new Error(`the copy_to of field ${key} changed, simple mapping update will not work`)
      }
    }
    // a freshly-added column carrying a copy_to (e.g. crossing the "wide" threshold by adding columns)
    // is not in the loop above, so also force a reindex whenever the _search catch-all field appears
    if (newMapping.properties._search && !oldMapping.properties._search) {
      throw new Error('the _search catch-all field is added, simple mapping update will not work')
    }
  }
  const res = await es.client.indices.putMapping({
    index,
    body: newMapping,
    timeout: '60s'
  })
  if (!res.acknowledged) throw new Error('failed to get cluster acknowledgement after updating index mapping ' + index)
}

const getAliases = async (dataset: any) => {
  let prodAlias
  try {
    prodAlias = await es.client.indices.getAlias({ name: aliasName({ ...dataset, draftReason: null }) })
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  let draftAlias
  try {
    draftAlias = await es.client.indices.getAlias({ name: aliasName({ ...dataset, draftReason: true }) })
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  return { prodAlias, draftAlias }
}

// deletion failures can happen during ES snapshots
// it is acceptable to tolerate these errors, log them and do some cleanup later
const safeDeleteIndex = async (index: any) => {
  try {
    await es.client.indices.delete({ index })
  } catch (err) {
    internalError('es-delete-index', err)
  }
}

// delete indices and aliases of a dataset
export const deleteIndex = async (dataset: any) => {
  const { prodAlias } = await getAliases(dataset)

  if (dataset.draftReason) {
    // in case of a draft dataset, delete all indices not used by the production alias
    const previousIndices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*`, ignore_unavailable: true })
    for (const index in previousIndices) {
      if (prodAlias && prodAlias[index]) continue
      await safeDeleteIndex(index)
    }
  } else {
    await safeDeleteIndex(`${indexPrefix(dataset)}-*`)
  }
}

// replace the index referenced by a dataset's alias
export const switchAlias = async (dataset: any, tempId: any) => {
  const name = aliasName(dataset)

  let existingAlias
  try {
    existingAlias = await es.client.indices.getAlias({ name })
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }

  const actions: any[] = []
  // removing with index=* seems to create strange behaviors when other indices have some operations
  if (existingAlias) {
    for (const index of Object.keys(existingAlias)) {
      actions.push({ remove: { alias: name, index } })
    }
  }
  actions.push({ add: { alias: name, index: tempId } })

  debug(`switch dataset index alias ${name} -> ${tempId}`)
  let res
  try {
    res = await es.client.indices.updateAliases({
      body: { actions },
      timeout: '60s'
    })
  } catch (err) {
    console.error(`failed to replace index alias ${name} -> ${tempId}`, err)
    throw new Error('[noretry] failed to replace index alias')
  }
  if (!res.acknowledged) throw new Error('[noretry] failed to get cluster acknowledgement after updating aliases ' + name)

  try {
    await clearAliases(dataset)
  } catch (err) {
    internalError('es-clear-aliases', err)
    await new Promise(resolve => setTimeout(resolve, 4000))
    await clearAliases(dataset)
  }
}

const clearAliases = async (dataset: any) => {
  // Delete indices of this dataset that are not referenced by either the draft or prod aliases
  const { prodAlias, draftAlias } = await getAliases(dataset)
  if (dataset.draftReason && !draftAlias) throw new Error('missing draft elasticsearch alias right after it should have been created')
  if (!dataset.draftReason && !prodAlias) throw new Error('missing production elasticsearch alias right after it should have been created')
  if (draftAlias && Object.keys(draftAlias).length !== 1) throw new Error('draft elasticsearch alias should reference exactly 1 index')
  if (prodAlias && Object.keys(prodAlias).length !== 1) throw new Error('production elasticsearch alias should reference exactly 1 index')
  debug('full aliases after update', prodAlias, draftAlias)
  const indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*`, ignore_unavailable: true })
  for (const index in indices) {
    if (prodAlias && prodAlias[index]) continue
    if (draftAlias && draftAlias[index]) continue
    debug('remove index not referenced by an alias', index)
    await safeDeleteIndex(index)
  }
}

// move an index from the draft alias to the production alias
export const validateDraftAlias = async (dataset: any) => {
  debug('validate draft alias of dataset', dataset.id)
  let aliases = await getAliases(dataset)
  if (!aliases.draftAlias || Object.keys(aliases.draftAlias).length !== 1) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    // I don't really understand why but it seems like wa have some consistency issues where draftAlias is not always immediately available
    aliases = await getAliases(dataset)
    if (!aliases.draftAlias || Object.keys(aliases.draftAlias).length !== 1) {
      throw new Error('[noretry] no draft alias to validate')
    }
  }
  debug('existing draft alias', aliases.draftAlias)

  const name = aliasName({ ...dataset, draftReason: true })
  debug('delete previous alias', name)
  const res = await es.client.indices.deleteAlias({
    name,
    // removing with index=* seems to create strange behaviors when other indices have some operations
    index: Object.keys(aliases.draftAlias)[0],
    timeout: '60s'
  })
  if (!res.acknowledged) throw new Error('[noretry] failed to get cluster acknowledgement after deleting previous aliases ' + name)
  await switchAlias({ ...dataset, draftReason: null }, Object.keys(aliases.draftAlias)[0])
}

const getNbShards = (dataset: any) => {
  return Math.max(1, Math.ceil((dataset.storage?.indexed?.size || 0) / config.elasticsearch.maxShardSize))
}

const indexBase = (dataset: any) => {
  const nbShards = getNbShards(dataset)
  const indexSettings: any = {
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

export const datasetInfos = async (dataset: any) => {
  if (dataset.isVirtual) return {}
  // const indices = await client.indices.get({index: `${indexPrefix(dataset)}-*`})
  const indices = await es.client.cat.indices({
    index: `${indexPrefix(dataset)}-*`,
    format: 'json',
    bytes: 'b',
    h: 'health,status,index,uuid,pri,rep,docs.count,docs.deleted,store.size,pri.store.size,segments.count'
  })
  for (const index of indices) {
    index.definition = (await es.client.indices.get({ index: index.index }))[index.index]
  }
  let alias
  try {
    alias = await es.client.indices.getAlias({ index: aliasName(dataset) })
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  const aliasedIndexName = Object.keys(alias ?? {})[0]
  const index = indices.find(index => index.index === aliasedIndexName)
  let ignoredFields: string[] = []
  if (index) {
    try {
      const ignoredRes: any = await es.client.search({
        index: aliasName(dataset),
        size: 0,
        aggs: { ignored: { terms: { field: '_ignored', size: 200 } } }
      })
      ignoredFields = (ignoredRes.aggregations?.ignored?.buckets ?? []).map((b: any) => b.key)
    } catch { /* best-effort diagnostic — never fail datasetInfos over it */ }
  }
  return {
    aliasName: aliasName(dataset),
    indexPrefix: indexPrefix(dataset),
    indices,
    alias,
    index,
    ignoredFields
  }
}

export const datasetFinalizeDiagnostics = async (dataset: any): Promise<{ esWarning: WarningCode | null, ignoredKeywordFields: string[] }> => {
  if (dataset.isVirtual || dataset.isMetaOnly || dataset.status === 'draft' || dataset.status === 'error') {
    return { esWarning: null, ignoredKeywordFields: [] }
  }
  const esInfos = await datasetInfos(dataset)
  return {
    esWarning: pickPrimaryCode(computeFinalizeWarnings(dataset, esInfos, config.elasticsearch)),
    ignoredKeywordFields: computeIgnoredKeywordFields(dataset, esInfos)
  }
}

// kept for any caller that only needs the primary code
export const datasetWarning = async (dataset: any): Promise<WarningCode | null> => (await datasetFinalizeDiagnostics(dataset)).esWarning

// Lightweight standalone helper for backfill: runs only the _ignored terms agg, no heavier index-metadata fetches.
// Returns [] on error (no index / closed index) so callers can safely set _esIgnoredKeywordFields = [].
export const getIgnoredKeywordFields = async (dataset: any): Promise<string[]> => {
  if (dataset.isVirtual) return []
  try {
    const res: any = await es.client.search({
      index: aliasName(dataset),
      size: 0,
      aggs: { ignored: { terms: { field: '_ignored', size: 200 } } }
    })
    const ignoredFields = (res.aggregations?.ignored?.buckets ?? []).map((b: any) => b.key)
    return computeIgnoredKeywordFields(dataset, { ignoredFields })
  } catch {
    return [] // no index / closed index — treat as none
  }
}
