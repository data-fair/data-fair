import config from '#config'
import mongo from '#mongo'
import express from 'express'
import axios from '../misc/utils/axios.js'
import slug from 'slugify'
import jsonRefs from 'json-refs'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import Extractor from 'html-extractor'
import i18n from 'i18n'
import * as i18nUtils from '../../i18n/utils.ts'
import * as findUtils from '../misc/utils/find.js'
import * as baseAppsUtils from './utils.js'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import { getThumbnail } from '../misc/utils/thumbnails.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { reqAdminMode, reqUser, reqUserAuthenticated, reqSession } from '@data-fair/lib-express'
import type { BaseApp, BaseAppWithContext, Request } from '#types'

const htmlExtractor = new Extractor()
export const router = express.Router()

// Fill the collection using the default base applications from config
// and cleanup non-public apps that are not used anywhere
export const init = async () => {
  await removeDeprecated()
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(app)))
}

// Auto removal of deprecated apps used in 0 configs
async function removeDeprecated () {
  const baseApps = await mongo.baseApplications.find({ deprecated: true }).limit(10000).toArray()
  for (const baseApp of baseApps) {
    const nbApps = await mongo.applications.countDocuments({ url: baseApp.url })
    if (nbApps === 0) await mongo.baseApplications.deleteOne({ id: baseApp.id })
  }
}

function prepareQuery (query: URLSearchParams) {
  return [...query.entries()]
    .filter(entry => !['skip', 'size', 'q', 'status', '{context.datasetFilter}', 'owner'].includes(entry[0]) && !entry[0].startsWith('${'))
    .reduce((a, entry) => { a[entry[0]] = entry[1].split(','); return a }, ({} as Record<string, string[]>))
}

const getFragmentFetchUrl = (fragment) => {
  if (!fragment) return null
  if (fragment['x-fromUrl']) return fragment['x-fromUrl']
  if (fragment.layout?.getItems?.url) {
    if (typeof fragment.layout.getItems.url === 'string') return fragment.layout.getItems.url
    return fragment.layout.getItems.url.expr
  }
  return null
}

async function failSafeInitBaseApp (app) {
  try {
    await initBaseApp(app)
  } catch (err) {
    internalError('app-init', err)
  }
}

// Attempts to init an application's description from a URL
async function initBaseApp (app) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const html = (await axios.get(app.url + 'index.html')).data
  const data: { meta: Record<string, string> } = await new Promise((resolve, reject) => htmlExtractor.extract(html, (err, data) => err ? reject(err) : resolve(data)))
  const patch: Partial<BaseApp> = {
    meta: data.meta,
    id: slug(app.url, { lower: true }),
    updatedAt: new Date().toISOString(),
    ...app
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema: any = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true

    // Read the config schema to deduce filters on datasets
    const datasetsDefinition = (configSchema.properties && configSchema.properties.datasets) || (configSchema.allOf && configSchema.allOf[0].properties && configSchema.allOf[0].properties.datasets)
    let datasetsFetches: { fromUrl: string, properties: Record<string, any> }[] = []
    if (datasetsDefinition) {
      if (getFragmentFetchUrl(datasetsDefinition.items)) datasetsFetches = [{ fromUrl: getFragmentFetchUrl(datasetsDefinition.items), properties: datasetsDefinition.items.properties }]
      if (Array.isArray(datasetsDefinition.items)) datasetsFetches = datasetsDefinition.items.filter(item => getFragmentFetchUrl(item)).map(item => ({ fromUrl: getFragmentFetchUrl(item), properties: item.properties }))
    }
    const datasetsFilters: any[] = []
    for (const datasetFetch of datasetsFetches) {
      const info = prepareQuery(new URL(datasetFetch.fromUrl, config.publicUrl).searchParams) as Record<string, any>
      info.fromUrl = datasetFetch.fromUrl
      if (datasetFetch.properties) info.properties = datasetFetch.properties
      datasetsFilters.push(info)
    }
    patch.datasetsFilters = datasetsFilters
  } catch (err) {
    patch.hasConfigSchema = false
    internalError('app-config-schema', err)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw new Error(i18n.__({ phrase: 'errors.noAppAtUrl', locale: config.i18n.defaultLocale }, { url: app.url }))
  }

  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = await mongo.baseApplications
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnDocument: 'after' })
  baseAppsUtils.clean(config.publicUrl, storedBaseApp)
  return storedBaseApp as BaseApp
}

async function syncBaseApp (baseApp: BaseApp) {
  const baseAppReference = { id: baseApp.id, url: baseApp.url, meta: baseApp.meta, datasetsFilters: baseApp.datasetsFilters }
  await mongo.applications.updateMany({ url: baseApp.url }, { $set: { baseApp: baseAppReference } })
  await mongo.applications.updateMany({ urlDraft: baseApp.url }, { $set: { baseAppDraft: baseAppReference } })
}

router.post('', async (req, res) => {
  reqAdminMode(req)
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    res.status(400).type('text/plain').send(req.__('Initializing a base application only accepts the "url" part.'))
    return
  }
  const baseApp = config.applications.find(a => a.url === req.body.url) || req.body
  const fullBaseApp = await initBaseApp(baseApp)
  await syncBaseApp(fullBaseApp)
  res.send(fullBaseApp)
})

router.patch('/:id', async (req, res) => {
  reqAdminMode(req)
  const patch = req.body
  const storedBaseApp = await mongo.baseApplications
    .findOneAndUpdate({ id: req.params.id }, { $set: patch }, { returnDocument: 'after' })
  if (!storedBaseApp) {
    res.status(404).send()
    return
  }
  await syncBaseApp(storedBaseApp)
  res.send(storedBaseApp)
})

const getQuery = (req, showAll = false) => {
  const query: any = { $and: [{ deprecated: { $ne: true } }] }
  const accessFilter: any[] = []

  accessFilter.push({ public: true })
  // Private access to applications is managed in a similar way as owner filter for
  // other resources (datasets, etc)
  // You can use ?privateAccess=user:alban,organization:koumoul
  const privateAccess: any[] = []
  if (req.query.privateAccess) {
    const user = reqUserAuthenticated(req)
    for (const p of req.query.privateAccess.split(',')) {
      const [type, id] = p.split(':')
      if (!user.adminMode) {
        if (type === 'user' && id !== user.id) throw httpError(403)
        if (type === 'organization' && !user.organizations.find(o => o.id === id)) throw httpError(403)
      }
      privateAccess.push({ type, id })
      accessFilter.push({ privateAccess: { $elemMatch: { type, id } } })
    }
  }
  if (!showAll) {
    query.$and.push({ $or: accessFilter })
  }
  return { query, privateAccess }
}

// Get the list. Non admin users can only see the public and non deprecated ones.
router.get('', cacheHeaders.noCache, async (_req, res) => {
  const req = _req as Request
  const sessionState = reqSession(req)
  const { query, privateAccess } = getQuery(req)
  if (req.query.applicationName) query.$and.push({ $or: [{ applicationName: req.query.applicationName }, { 'meta.application-name': req.query.applicationName }] })
  if (req.query.q) query.$and.push({ $text: { $search: req.query.q } })

  const [skip, size] = findUtils.pagination(req.query)
  const baseApplications = mongo.baseApplications
  const findPromise = baseApplications
    .find(query)
    .collation({ locale: 'en' })
    .sort({ title: 1 }).limit(size).skip(skip)
    .toArray()
  const countPromise = baseApplications.countDocuments(query)
  const [results, count] = await Promise.all([findPromise, countPromise])
  for (const result of results) {
    baseAppsUtils.clean(req.publicBaseUrl, result, req.query.thumbnail, req.query.html === 'true')
    // keep only the private access that concerns the current request
    result.privateAccess = (result.privateAccess || []).filter(p => privateAccess.find(p2 => p2.type === p.type && p2.id === p.id))
  }

  // optionally complete informations based on a dataset to guide user in selecting suitable application
  if (req.query.dataset) {
    const account = sessionState.account
    if (!account) throw httpError(403, 'dataset parameter requires authentication')
    let datasetBBox, datasetVocabulary, datasetTypes, datasetId, datasetCount
    const vocabulary = i18nUtils.vocabulary[req.getLocale()]
    if (req.query.dataset === 'any') {
      // match constraints against all datasets of current account
      const filter = { 'owner.type': account.type, 'owner.id': account.id }
      datasetCount = await mongo.datasets.countDocuments(filter)
      datasetBBox = !!(await mongo.datasets.countDocuments({ $and: [{ bbox: { $exists: true } }, filter] }))
      const facet = {
        types: [{ $match: { 'schema.x-calculated': { $ne: true } } }, { $group: { _id: { type: '$schema.type' } } }],
        concepts: [{ $group: { _id: { concept: '$schema.x-refersTo' } } }]
      }
      const facetResults = await mongo.datasets.aggregate([
        { $match: filter },
        { $project: { 'schema.type': 1, 'schema.x-refersTo': 1, 'schema.x-calculated': 1 } },
        { $unwind: '$schema' },
        { $facet: facet }]).toArray()

      datasetTypes = facetResults[0]?.types.map(t => t._id.type) ?? []
      datasetVocabulary = facetResults[0]?.concepts.map(t => t._id.concept).filter(c => !!c) ?? []
    } else {
      // match constraints against a specific dataset
      datasetCount = 1
      datasetId = req.query.dataset
      const dataset = await mongo.datasets.findOne({ id: datasetId, 'owner.type': account.type, 'owner.id': account.id })
      if (!dataset) {
        res.status(404).send(req.__('errors.missingDataset', { id: datasetId }))
        return
      }
      datasetTypes = (dataset.schema || []).filter(field => !field['x-calculated']).map(field => field.type)
      datasetVocabulary = (dataset.schema || []).map(field => field['x-refersTo']).filter(c => !!c)
      datasetBBox = !!dataset.bbox
    }
    for (const _application of results) {
      const application = _application as unknown as BaseAppWithContext
      application.disabled = []
      application.category = application.category || 'autre'
      if (datasetId && (!application.datasetsFilters || !application.datasetsFilters.length)) {
        application.disabled.push(req.__('appRequire.noDataset'))
      } else {
        const requirements: string[] = []
        if (application.datasetsFilters && application.datasetsFilters.length && !datasetCount) {
          requirements.push(req.__('appRequire.aDataset'))
        } else {
          for (const filter of application.datasetsFilters || []) {
            if (filter.bbox && !datasetBBox) {
              requirements.push(req.__('appRequire.geoData'))
            }
            if (filter.concepts) {
              const concepts = filter.concepts as string[]
              const foundConcepts: string[] = []
              for (const concept of concepts) {
                if (datasetVocabulary.includes(concept)) {
                  foundConcepts.push(concept)
                }
              }
              if (!foundConcepts.length) {
                if (concepts.length === 1) {
                  requirements.push(req.__('appRequire.aConcept', { concept: vocabulary[filter.concepts[0]].title }))
                } else {
                  requirements.push(req.__('appRequire.oneOfConcepts', { concepts: concepts.map(concept => vocabulary[concept].title).join(req.__('appRequire.orJoin')) }))
                }
              }
            }
            const fieldTypes = filter['field-type'] as string[]
            if (fieldTypes && !datasetTypes.find(t => fieldTypes.includes(t))) {
              if (fieldTypes.length === 1) {
                requirements.push(req.__('appRequire.aType', { type: fieldTypes[0] }))
              } else {
                requirements.push(req.__('appRequire.oneOfTypes', { types: fieldTypes.join(req.__('appRequire.orJoin')) }))
              }
            }
          }
        }
        if (requirements.length) {
          application.disabled.push(`${req.__('appRequire.requires')}${requirements.join(req.__('appRequire.requiresJoin'))}.`)
        }
      }
    }
  }

  res.send({ count, results })
})

router.get('/:id/icon', async (req, res, next) => {
  const user = reqUser(req)
  const { query } = getQuery(req, !!(user?.adminMode))
  query.$and.push({ id: req.params.id })
  const baseApp = await mongo.baseApplications.findOne(query, { projection: { url: 1 } })
  if (!baseApp) {
    res.status(404).send()
    return
  }
  const iconUrl = baseApp.url.replace(/\/$/, '') + '/icon.png'
  await getThumbnail(req, res, iconUrl)
})
router.get('/:id/thumbnail', async (req, res, next) => {
  const user = reqUser(req)
  const { query } = getQuery(req, !!(user?.adminMode))
  query.$and.push({ id: req.params.id })
  const baseApp = await mongo.baseApplications.findOne(query, { projection: { image: 1, url: 1 } })
  if (!baseApp) {
    res.status(404).send()
    return
  }
  const imageUrl = baseApp.image || baseApp.url.replace(/\/$/, '') + '/thumbnail.png'
  await getThumbnail(req, res, imageUrl)
})
