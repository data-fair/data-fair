import util from 'util'
import config from '#config'
import mongo from '#mongo'
import express from 'express'
import axios from '../misc/utils/axios.js'
import slug from 'slugify'
import jsonRefs from 'json-refs'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import Extractor from 'html-extractor'
import i18n from 'i18n'
import * as i18nUtils from '../../i18n/utils.js'
import * as findUtils from '../misc/utils/find.js'
import * as baseAppsUtils from './utils.js'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import { getThumbnail } from '../misc/utils/thumbnails.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { assertAdminMode, reqAdminMode, reqUser, reqUserAuthenticated } from '@data-fair/lib-express'

const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)
export const router = express.Router()

// Fill the collection using the default base applications from config
// and cleanup non-public apps that are not used anywhere
export const init = async (db) => {
  await removeDeprecated(db)
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(db, app)))
}

// Auto removal of deprecated apps used in 0 configs
async function removeDeprecated (db) {
  const baseApps = await db.collection('base-applications').find({ deprecated: true }).limit(10000).toArray()
  for (const baseApp of baseApps) {
    const nbApps = await db.collection('applications').countDocuments({ url: baseApp.url })
    if (nbApps === 0) await db.collection('base-applications').deleteOne({ id: baseApp.id })
  }
}

function prepareQuery (/** @type {URLSearchParams} */query) {
  return [...query.keys()]
    .filter(key => !['skip', 'size', 'q', 'status', '{context.datasetFilter}', 'owner'].includes(key))
    .reduce((a, key) => { a[key] = query.get(key).split(','); return a }, /** @type {Record<string, string[]>} */({}))
}

async function failSafeInitBaseApp (db, app) {
  try {
    await initBaseApp(db, app)
  } catch (err) {
    internalError('app-init', err)
  }
}

// Attempts to init an application's description from a URL
async function initBaseApp (db, app) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const html = (await axios.get(app.url + 'index.html')).data
  const data = await htmlExtractor.extract(html)
  const patch = {
    meta: data.meta,
    id: slug(app.url, { lower: true }),
    updatedAt: new Date().toISOString(),
    ...app
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true

    // Read the config schema to deduce filters on datasets
    const datasetsDefinition = (configSchema.properties && configSchema.properties.datasets) || (configSchema.allOf && configSchema.allOf[0].properties && configSchema.allOf[0].properties.datasets)
    let datasetsFetches = []
    if (datasetsDefinition) {
      if (datasetsDefinition['x-fromUrl']) datasetsFetches = [datasetsDefinition['x-fromUrl']]
      if (datasetsDefinition.items && datasetsDefinition.items['x-fromUrl']) datasetsFetches = [{ fromUrl: datasetsDefinition.items['x-fromUrl'], properties: datasetsDefinition.items.properties }]
      if (Array.isArray(datasetsDefinition.items)) datasetsFetches = datasetsDefinition.items.map(item => ({ fromUrl: item['x-fromUrl'], properties: item.properties }))
    }
    const datasetsFilters = []
    for (const datasetFetch of datasetsFetches) {
      const info = prepareQuery(new URL(datasetFetch.fromUrl, config.publicUrl).searchParams)
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

  const storedBaseApp = await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnDocument: 'after' })
  baseAppsUtils.clean(config.publicUrl, storedBaseApp)
  return storedBaseApp
}

async function syncBaseApp (db, baseApp) {
  const baseAppReference = { id: baseApp.id, url: baseApp.url, meta: baseApp.meta, datasetsFilters: baseApp.datasetsFilters }
  await db.collection('applications').updateMany({ url: baseApp.url }, { $set: { baseApp: baseAppReference } })
  await db.collection('applications').updateMany({ urlDraft: baseApp.url }, { $set: { baseAppDraft: baseAppReference } })
}

router.post('', async (req, res) => {
  const db = mongo.db
  reqAdminMode(req)
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    return res.status(400).type('text/plain').send(req.__('Initializing a base application only accepts the "url" part.'))
  }
  const baseApp = config.applications.find(a => a.url === req.body.url) || req.body
  const fullBaseApp = await initBaseApp(db, baseApp)
  syncBaseApp(db, fullBaseApp)
  res.send(fullBaseApp)
})

router.patch('/:id', async (req, res) => {
  const db = mongo.db
  reqAdminMode(req)
  const patch = req.body
  const storedBaseApp = await db.collection('base-applications')
    .findOneAndUpdate({ id: req.params.id }, { $set: patch }, { returnDocument: 'after' })
  if (!storedBaseApp) return res.status(404).send()
  syncBaseApp(db, storedBaseApp)
  res.send(storedBaseApp)
})

const getQuery = (req, showAll = false) => {
  const query = { $and: [{ deprecated: { $ne: true } }] }
  const accessFilter = []

  accessFilter.push({ public: true })
  // Private access to applications is managed in a similar way as owner filter for
  // other resources (datasets, etc)
  // You can use ?privateAccess=user:alban,organization:koumoul
  const privateAccess = []
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
router.get('', cacheHeaders.noCache, async (req, res) => {
  const db = mongo.db
  const { query, privateAccess } = getQuery(req)
  if (req.query.applicationName) query.$and.push({ $or: [{ applicationName: req.query.applicationName }, { 'meta.application-name': req.query.applicationName }] })
  if (req.query.q) query.$and.push({ $text: { $search: req.query.q } })

  const [skip, size] = findUtils.pagination(req.query)
  const baseApplications = db.collection('base-applications')
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
    let datasetBBox, datasetVocabulary, datasetTypes, datasetId, datasetCount
    const vocabulary = i18nUtils.vocabulary[req.getLocale()]
    if (req.query.dataset === 'any') {
      // match constraints against all datasets of current account
      const filter = { 'owner.type': req.sessionState.account.type, 'owner.id': req.sessionState.account.id }
      datasetCount = await db.collection('datasets').countDocuments(filter)
      datasetBBox = !!(await db.collection('datasets').countDocuments({ $and: [{ bbox: { $ne: null } }, filter] }))
      const facet = {
        types: [{ $match: { 'schema.x-calculated': { $ne: true } } }, { $group: { _id: { type: '$schema.type' } } }],
        concepts: [{ $group: { _id: { concept: '$schema.x-refersTo' } } }]
      }
      const facetResults = await db.collection('datasets').aggregate([
        { $match: filter },
        { $project: { 'schema.type': 1, 'schema.x-refersTo': 1, 'schema.x-calculated': 1 } },
        { $unwind: '$schema' },
        { $facet: facet }]).toArray()

      datasetTypes = facetResults[0].types.map(t => t._id.type)
      datasetVocabulary = facetResults[0].concepts.map(t => t._id.concept).filter(c => !!c)
    } else {
      // match constraints against a specific dataset
      datasetCount = 1
      datasetId = req.query.dataset
      const dataset = await db.collection('datasets').findOne({ id: datasetId, 'owner.type': req.sessionState.account.type, 'owner.id': req.sessionState.account.id })
      if (!dataset) return res.status(404).send(req.__('errors.missingDataset', { id: datasetId }))
      datasetTypes = (dataset.schema || []).filter(field => !field['x-calculated']).map(field => field.type)
      datasetVocabulary = (dataset.schema || []).map(field => field['x-refersTo']).filter(c => !!c)
      datasetBBox = !!dataset.bbox
    }
    for (const application of results) {
      application.disabled = []
      application.category = application.category || 'autre'
      if (datasetId && (!application.datasetsFilters || !application.datasetsFilters.length)) {
        application.disabled.push(req.__('appRequire.noDataset'))
      } else {
        const requirements = []
        if (application.datasetsFilters && application.datasetsFilters.length && !datasetCount) {
          requirements.push(req.__('appRequire.aDataset'))
        } else {
          for (const filter of application.datasetsFilters || []) {
            if (filter.bbox && !datasetBBox) {
              requirements.push(req.__('appRequire.geoData'))
            }
            if (filter.concepts) {
              const foundConcepts = []
              for (const concept of filter.concepts) {
                if (datasetVocabulary.includes(concept)) {
                  foundConcepts.push(concept)
                }
              }
              if (!foundConcepts.length) {
                if (filter.concepts.length === 1) {
                  requirements.push(req.__('appRequire.aConcept', { concept: vocabulary[filter.concepts[0]].title }))
                } else {
                  requirements.push(req.__('appRequire.oneOfConcepts', { concepts: filter.concepts.map(concept => vocabulary[concept].title).join(req.__('appRequire.orJoin')) }))
                }
              }
            }
            if (filter['field-type'] && !datasetTypes.find(t => filter['field-type'].includes(t))) {
              if (filter['field-type'].length === 1) {
                requirements.push(req.__('appRequire.aType', { type: filter['field-type'][0] }))
              } else {
                requirements.push(req.__('appRequire.oneOfTypes', { types: filter['field-type'].join(req.__('appRequire.orJoin')) }))
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
  const db = mongo.db
  const user = reqUser(req)
  const { query } = getQuery(req, !!(user?.adminMode))
  query.$and.push({ id: req.params.id })
  const baseApp = await db.collection('base-applications').findOne(query, { url: 1 })
  if (!baseApp) return res.status(404).send()
  const iconUrl = baseApp.url.replace(/\/$/, '') + '/icon.png'
  await getThumbnail(req, res, iconUrl)
})
router.get('/:id/thumbnail', async (req, res, next) => {
  const db = mongo.db
  const user = reqUser(req)
  const { query } = getQuery(req, !!(user?.adminMode))
  query.$and.push({ id: req.params.id })
  const baseApp = await db.collection('base-applications').findOne(query, { url: 1 })
  if (!baseApp) return res.status(404).send()
  const imageUrl = baseApp.image || baseApp.url.replace(/\/$/, '') + '/thumbnail.png'
  await getThumbnail(req, res, imageUrl)
})
