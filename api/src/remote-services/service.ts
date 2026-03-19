import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.js'
import { clean, computeActions, initNew } from './operations.ts'
import mongoEscape from 'mongo-escape'
import config from '#config'
import * as settingsUtils from '../misc/utils/settings.ts'
import debugLib from 'debug'
import datasetAPIDocs from '../../contract/dataset-api-docs.js'
import axios from '../misc/utils/axios.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import slug from 'slugify'
import { type SessionState } from '@data-fair/lib-express'
import { type Locale } from '../../i18n/utils.ts'
import { type Dataset } from '#types'

const debugMasterData = debugLib('master-data')

const filterFieldsMap = {
  'input-concepts': 'actions.input.concept',
  'output-concepts': 'actions.output.concept',
  inputCollection: 'actions.inputCollection',
  outputCollection: 'actions.outputCollection',
  'api-id': 'apiDoc.info.x-api-id',
  ids: 'id',
  id: 'id',
  status: 'status'
}

const fixConceptsFilters = async (locale: Locale, reqQuery: Record<string, string>, sessionState: SessionState) => {
  let vocabulary
  for (const key of ['input-concepts', 'output-concepts']) {
    if (!reqQuery[key]) continue
    const values = reqQuery[key].split(',')
    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (value.startsWith('https://') || value.startsWith('http://')) continue
      vocabulary = vocabulary || await settingsUtils.getFullOwnerVocabulary(sessionState.account, locale)
      const concept = vocabulary.find(c => c.id === reqQuery[key])
      if (concept && concept.identifiers && concept.identifiers.length) {
        values[i] = concept.identifiers[0]
      }
    }
    reqQuery[key] = values.join(',')
  }
}

export const syncDataset = async (dataset: Dataset) => {
  if (dataset.draftReason) return

  // console.log('SYNC ko', JSON.stringify(dataset, null, 2))

  const id = 'dataset:' + dataset.id
  if (dataset.masterData && (
    (dataset.masterData.singleSearchs && dataset.masterData.singleSearchs.length) ||
    (dataset.masterData.bulkSearchs && dataset.masterData.bulkSearchs.length) ||
    (dataset.masterData.virtualDatasets && dataset.masterData.virtualDatasets.active) ||
    (dataset.masterData.standardSchema && dataset.masterData.standardSchema.active)
  )) {
    debugMasterData(`sync a dataset with master data to a remote service ${dataset.id} (${dataset.slug}) -> ${id}`, dataset.masterData)
    const settings = await mongo.settings
      .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })

    const existingService = await mongo.remoteServices
      .findOne({ id })
    const apiDoc = datasetAPIDocs(dataset, config.publicUrl, settings).api
    const service = initNew({
      id,
      apiDoc,
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}/api-docs.json`,
      server: apiDoc.servers && apiDoc.servers.length && apiDoc.servers[0].url,
      privateAccess: [{ type: dataset.owner.type, id: dataset.owner.id, name: dataset.owner.name }],
      virtualDatasets: {
        parent: {
          id: dataset.id,
          title: dataset.title,
          owner: dataset.owner
        },
        active: !!(dataset.masterData.virtualDatasets && dataset.masterData.virtualDatasets.active),
        storageRatio: 0
      },
      standardSchema: {
        dataset: {
          id: dataset.id,
          title: dataset.title
        },
        active: !!(dataset.masterData.standardSchema && dataset.masterData.standardSchema.active)
      }
    })
    if (dataset.masterData.shareOrgs?.length) {
      service.privateAccess = [...service.privateAccess, ...dataset.masterData.shareOrgs.map(p => ({ ...p, type: 'organization' }))]
    }
    if (existingService) {
      service.public = !!existingService.public
      // service.privateAccess = existingService.privateAccess || []
      if (existingService.virtualDatasets) {
        service.virtualDatasets.storageRatio = existingService.virtualDatasets.storageRatio || 0
      }
    }
    const { assertValid: validate } = await import('#types/remote-service/index.js')
    validate(service)
    await mongo.remoteServices.replaceOne({ id }, mongoEscape.escape(service, true), { upsert: true })
  } else {
    const deleted = await mongo.remoteServices.deleteOne({ id })
    if (deleted?.deletedCount) debugMasterData(`deleted remote service ${id}`)
  }
}

// Create default services for the data-fair instance
export const init = async () => {
  debugMasterData('init default remote services ?')
  const existingServices = await mongo.remoteServices.find({ owner: { $exists: false } }).limit(1000).project({ url: 1, id: 1 }).toArray()

  const servicesToAdd: { url: string }[] = config.remoteServices
    .filter(s => !existingServices.find(es => es.url === s.url || es.id === s.id))

  const apisToFetch = new Set(servicesToAdd.map(s => s.url).filter(Boolean))
  const apis: { url: string, api: any }[] = []
  for (const url of [...apisToFetch]) {
    try {
      const resp = await axios.get(url)
      apis.push({ url, api: resp.data })
    } catch (err) {
      internalError('service-init', err)
    }
  }

  const apisDict = Object.assign({}, ...apis.map(a => ({ [a.url]: a.api })))
  const servicesToInsert = servicesToAdd.filter(s => apisDict[s.url] && apisDict[s.url].info).map(s => mongoEscape.escape({
    id: slug(apisDict[s.url].info['x-api-id']),
    title: apisDict[s.url].info.title,
    description: apisDict[s.url].info.description,
    url: s.url,
    apiDoc: apisDict[s.url],
    server: apisDict[s.url].servers && apisDict[s.url].servers.length && apisDict[s.url].servers[0].url,
    actions: computeActions(apisDict[s.url]),
    public: true,
    privateAccess: []
  }, true)).filter(s => !existingServices.find(es => es.id === s.id))

  for (const service of servicesToAdd) {
    if (!service.url && service.server && service.id) {
      servicesToInsert.push({
        id: service.id,
        title: service.title,
        description: service.description ?? '',
        url: null,
        apiDoc: null,
        server: service.server,
        actions: [],
        public: true,
        privateAccess: []
      })
    }
  }
  if (servicesToInsert.length) {
    debugMasterData('insert default remote services', servicesToInsert)
    await mongo.remoteServices.insertMany(servicesToInsert)
  } else {
    debugMasterData('no default remote services to insert')
  }
}

export const findRemoteServices = async (locale: Locale, publicationSite: any, publicBaseUrl: string, reqQuery: Record<string, string>, sessionState: SessionState) => {
  const remoteServices = mongo.remoteServices
  const extraFilters: any[] = []
  if (reqQuery['virtual-datasets'] === 'true' || reqQuery.virtualDatasets === 'true') {
    extraFilters.push({ 'virtualDatasets.active': true })
  }
  if (reqQuery['standard-schema'] === 'true' || reqQuery.standardSchema === 'true') {
    extraFilters.push({ 'standardSchema.active': true })
  }
  await fixConceptsFilters(locale, reqQuery, sessionState)
  const query = findUtils.query(reqQuery, locale, sessionState, 'remote-services', filterFieldsMap, true, extraFilters)

  delete reqQuery.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(reqQuery.sort, reqQuery.q)
  const project = findUtils.project(reqQuery.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(reqQuery)
  const mongoQueries = [
    size > 0 ? remoteServices.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    remoteServices.countDocuments(query)
  ]
  if (reqQuery.facets) {
    mongoQueries.push(remoteServices.aggregate(findUtils.facetsQuery(reqQuery, sessionState, 'remote-services', {}, filterFieldsMap)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  // @ts-ignore
  for (const r of results) {
    clean(r, sessionState, reqQuery.html)
  }
  facets = findUtils.parseFacets(facets)
  // @ts-ignore
  return { count, results: results.map(result => mongoEscape.unescape(result, true)), facets }
}

const actionsExtraFilters = [{ 'actions.type': 'http://schema.org/SearchAction' }]

export const findActions = async (locale: Locale, publicationSite: any, publicBaseUrl: string, reqQuery: Record<string, string>, sessionState: SessionState) => {
  await fixConceptsFilters(locale, reqQuery, sessionState)
  const query = findUtils.query(reqQuery, locale, sessionState, 'remote-services', filterFieldsMap, true, actionsExtraFilters)

  delete reqQuery.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(reqQuery.sort, reqQuery.q)
  const project = findUtils.project(reqQuery.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(reqQuery)

  /* const countPipeline = [
    { $match: query }, // filter before the unwind for performance
    { $project: { _id: 0, 'actions.id': 1 } },
    { $unwind: '$actions' },
    { $match: query }, // filter after the unwind to select individual actions
    { $count: 'count' }
  ]
  const countRes = await mongo.remoteServices.aggregate(countPipeline).toArray()
  console.log('countRes', countRes) */

  const actionsQuery = { ...query }
  delete actionsQuery.$text

  const pipeline: any[] = [
    { $match: query }, // filter before the unwind for performance
    { $unwind: '$actions' },
    { $match: actionsQuery }, // filter after the unwind to select individual actions
    { $project: project }
  ]
  if (Object.keys(sort).length) pipeline.push({ $sort: sort })
  pipeline.push({ $skip: skip })
  pipeline.push({ $limit: size })

  const aggRes = await mongo.remoteServices.aggregate(pipeline).toArray()
  const results = aggRes.map(remoteService => {
    const result: any = {
      id: `${remoteService.id}--${remoteService.actions.id}`,
      title: remoteService.actions.summary,
      action: remoteService.actions
    }
    delete remoteService.actions
    result.remoteService = remoteService
    return result
  })
  return { results }
}
