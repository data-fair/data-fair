import config from '#config'
import mongo from '#mongo'
import axios from '../misc/utils/axios.js'
import jsonRefs from 'json-refs'
import i18n from 'i18n'
import Extractor from 'html-extractor'
import slug from 'slugify'
import { internalError } from '@data-fair/lib-node/observer.js'
import { clean, prepareQuery, getFragmentFetchUrl } from './operations.ts'
import type { BaseApp } from '#types'

const htmlExtractor = new Extractor()

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

async function failSafeInitBaseApp (app) {
  try {
    await initBaseApp(app)
  } catch (err) {
    internalError('app-init', err)
  }
}

// Attempts to init an application's description from a URL
export async function initBaseApp (app) {
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
      if (datasetsDefinition.items && getFragmentFetchUrl(datasetsDefinition)) datasetsFetches = [{ fromUrl: getFragmentFetchUrl(datasetsDefinition), properties: datasetsDefinition.items.properties }]
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
  clean(config.publicUrl, storedBaseApp)
  return storedBaseApp as BaseApp
}

export async function syncBaseApp (baseApp: BaseApp) {
  const baseAppReference = { id: baseApp.id, url: baseApp.url, meta: baseApp.meta, datasetsFilters: baseApp.datasetsFilters }
  await mongo.applications.updateMany({ url: baseApp.url }, { $set: { baseApp: baseAppReference } })
  await mongo.applications.updateMany({ urlDraft: baseApp.url }, { $set: { baseAppDraft: baseAppReference } })
}
