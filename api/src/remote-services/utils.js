import * as findUtils from '../misc/utils/find.js'
import { prepareMarkdownContent } from '../misc/utils/markdown.js'
import soasLoader from 'soas'
import axios from '../misc/utils/axios.js'
import * as ajv from '../misc/utils/ajv.js'
import config from '#config'
import mongoEscape from 'mongo-escape'
import slug from 'slugify'
import * as settingsUtils from '../misc/utils/settings.js'
import servicePatch from '../../contract/remote-service-patch.js'
import datasetAPIDocs from '../../contract/dataset-api-docs.js'
import remoteServiceSchema from '../../contract/remote-service.js'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'

const debugMasterData = debugLib('master-data')

export const validate = ajv.compile(remoteServiceSchema)
export const validatePatch = ajv.compile(servicePatch)
export const validateOpenApi = ajv.compile('openapi-3.1')

export const initNew = (body) => {
  const service = { ...body }
  if (service.apiDoc) {
    if (service.apiDoc.info) {
      service.title = service.title || service.apiDoc.info.title
      service.description = service.apiDoc.info.description
    }
    service.actions = computeActions(service.apiDoc)
  }
  return service
}

/**
 * TODO replace this with storing the short id of concepts on remote services ?
 * make output.concept an object as x-concept in datasets schemas ?
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 */
export const fixConceptsFilters = async (db, locale, reqQuery, user) => {
  let vocabulary
  for (const key of ['input-concepts', 'output-concepts']) {
    if (!reqQuery[key]) continue
    const values = reqQuery[key].split(',')
    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (value.startsWith('https://') || value.startsWith('http://')) continue
      vocabulary = vocabulary || await settingsUtils.getFullOwnerVocabulary(db, user && user.activeAccount, locale)
      const concept = vocabulary.find(c => c.id === reqQuery[key])
      if (concept && concept.identifiers && concept.identifiers.length) {
        values[i] = concept.identifiers[0]
      }
    }
    reqQuery[key] = values.join(',')
  }
}

export const syncDataset = async (db, dataset) => {
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
    const settings = await db.collection('settings')
      .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })

    const existingService = await db.collection('remote-services')
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
          title: dataset.title
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
    if (existingService) {
      service.public = !!existingService.public
      service.privateAccess = existingService.privateAccess || []
      if (existingService.virtualDatasets) {
        service.virtualDatasets.storageRatio = existingService.virtualDatasets.storageRatio || 0
      }
    }
    validate(service)
    await db.collection('remote-services').replaceOne({ id }, mongoEscape.escape(service, true), { upsert: true })
  } else {
    const deleted = await db.collection('remote-services').deleteOne({ id })
    if (deleted?.deletedCount) debugMasterData(`deleted remote service ${id}`)
  }
}

// Create default services for the data-fair instance
export const init = async (db) => {
  debugMasterData('init default remote services ?')
  const remoteServices = db.collection('remote-services')
  const existingServices = await remoteServices.find({ owner: { $exists: false } }).limit(1000).project({ url: 1, id: 1 }).toArray()

  const servicesToAdd = config.remoteServices
    .filter(s => !existingServices.find(es => es.url === s.url || es.id === s.id))

  const apisToFetch = new Set(servicesToAdd.map(s => s.url).filter(Boolean))
  const apisPromises = [...apisToFetch].map(url => {
    return axios.get(url)
      .then(resp => ({ url, api: resp.data }))
      .catch(err => {
        internalError('service-init', err)
      })
  })
  const apis = (await Promise.all(apisPromises)).filter(a => a && a.api)
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
    await remoteServices.insertMany(servicesToInsert)
  } else {
    debugMasterData('no default remote services to insert')
  }
}

// TODO: explain ? simplify ? hard to understand piece of code
export const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  for (const a of actions) {
    a.input = Object.keys(a.input).map(concept => ({ concept, ...a.input[concept] }))
    const outputSchema = a.outputSchema
    if (outputSchema) {
      const outputProps = a.outputSchema.properties || (a.outputSchema.items && a.outputSchema.items.properties) || {}
      a.output = Object.keys(outputProps).map(prop => ({ name: prop, concept: outputProps[prop]['x-refersTo'], ...outputProps[prop] }))
    } else {
      a.output = []
    }
  }
  return actions
}

export const clean = (remoteService, user, html = false) => {
  delete remoteService._id
  if (remoteService.apiKey && remoteService.apiKey.value) remoteService.apiKey.value = '**********'
  if (!user || !user.adminMode) delete remoteService.privateAccess
  if (remoteService.description) {
    remoteService.description = prepareMarkdownContent(remoteService.description, html, null, `remoteService:${remoteService.id}`, remoteService.updatedAt)
  }
  findUtils.setResourceLinks(remoteService, 'remote-service')
  return remoteService
}
