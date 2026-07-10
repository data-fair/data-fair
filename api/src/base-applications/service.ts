import config from '#config'
import mongo from '#mongo'
import fsp from 'node:fs/promises'
import path from 'node:path'
import axios from '../misc/utils/axios.ts'
import jsonRefs from 'json-refs'
import i18n from 'i18n'
import * as parse5 from 'parse5'
import slug from 'slugify'
import { internalError } from '@data-fair/lib-node/observer.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { clean, prepareQuery, getFragmentFetchUrl } from './operations.ts'
import { ensureBaseAppDir, baseAppUrl } from './registry.ts'
import type { BaseApp } from '#types'

// Meta field names that may appear multiple times with a lang attribute.
// For these we pick the variant matching the requester's locale, with fallback.
const langAwareMetaNames = ['description', 'keywords']

// Extract a flat meta map from an application's index.html, respecting
// `lang` attributes on <title> and lang-aware meta tags.
// Selection order for lang-aware tags:
//   1. tag with lang === locale
//   2. tag with lang === defaultLocale
//   3. first tag (with or without lang)
function extractHeadMeta (html: string, locale: string, defaultLocale: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const doc = parse5.parse(html) as any
  const htmlNode = doc.childNodes?.find((c: any) => c.tagName === 'html')
  const head = htmlNode?.childNodes?.find((c: any) => c.tagName === 'head')
  if (!head) return meta

  const attr = (node: any, name: string): string | undefined =>
    node.attrs?.find((a: any) => a.name === name)?.value

  const titles: { lang?: string, text: string }[] = []
  const metasByName = new Map<string, { lang?: string, content?: string }[]>()

  for (const node of head.childNodes as any[]) {
    if (node.tagName === 'title') {
      const text = node.childNodes?.find((c: any) => c.nodeName === '#text')?.value ?? ''
      titles.push({ lang: attr(node, 'lang'), text })
    } else if (node.tagName === 'meta') {
      const name = attr(node, 'name')
      if (!name) continue
      if (!metasByName.has(name)) metasByName.set(name, [])
      metasByName.get(name)!.push({ lang: attr(node, 'lang'), content: attr(node, 'content') })
    }
  }

  const pick = <T extends { lang?: string }>(items: T[]): T | undefined =>
    items.find(i => i.lang === locale) ??
    items.find(i => i.lang === defaultLocale) ??
    items[0]

  const pickedTitle = pick(titles)
  if (pickedTitle) meta.title = pickedTitle.text

  for (const [name, tags] of metasByName) {
    const picked = langAwareMetaNames.includes(name) ? pick(tags) : tags[0]
    if (picked?.content != null) meta[name] = picked.content
  }

  return meta
}

// Read a resolved config-schema to deduce filters on datasets. Shared between the
// legacy URL-based import (initBaseApp) and the registry-based one (initBaseAppFromArtefact).
export function deriveDatasetsFilters (configSchema: any): any[] {
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
  return datasetsFilters
}

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

// Attempts to init an application's description from a URL.
// `locale` is the locale of the admin triggering the import — used to pick
// the right variant when the app declares multiple <title>/<meta> tags with
// a `lang` attribute. Falls back to the API's default locale when absent.
export async function initBaseApp (app, locale?: string) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const defaultLocale = config.i18n.defaultLocale
  const effectiveLocale = locale || defaultLocale
  let html: string
  try {
    html = (await axios.get(app.url + 'index.html')).data
  } catch (err) {
    throw httpError(400, i18n.__({ phrase: 'errors.noAppAtUrl', locale: effectiveLocale }, { url: app.url }))
  }
  const meta = extractHeadMeta(html, effectiveLocale, defaultLocale)
  const patch: Partial<BaseApp> = {
    meta,
    id: slug(app.url, { lower: true }),
    updatedAt: new Date().toISOString(),
    ...app
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema: any = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true
    patch.datasetsFilters = deriveDatasetsFilters(configSchema)
  } catch (err) {
    patch.hasConfigSchema = false
    internalError('app-config-schema', err)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw httpError(400, i18n.__({ phrase: 'errors.noAppAtUrl', locale: effectiveLocale }, { url: app.url }))
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

// registry metadata that data-fair mirrors onto the base-application doc at sync time.
// The registry is authoritative for these fields; everything else (meta, datasetsFilters,
// applicationName, version) is derived from the tarball content.
const registryArtefactHeaders = () => ({ 'x-secret-key': config.secretKeys.registry })

const localizedRegistryField = (field: { fr?: string, en?: string } | undefined, locale: string): string | undefined => {
  if (!field) return undefined
  return field[locale as 'fr' | 'en'] ?? field.fr ?? field.en
}

// Init a base app from its registry artefact: download/refresh the extracted tarball,
// derive meta + datasetsFilters from its content, merge registry metadata, upsert.
export async function initBaseAppFromArtefact (artefactId: string, locale?: string) {
  const defaultLocale = config.i18n.defaultLocale
  const effectiveLocale = locale || defaultLocale
  const { dir, version } = await ensureBaseAppDir(artefactId)
  const url = baseAppUrl(artefactId)

  let html: string
  try {
    html = await fsp.readFile(path.join(dir, 'index.html'), 'utf8')
  } catch (err) {
    throw httpError(400, i18n.__({ phrase: 'errors.noAppAtUrl', locale: effectiveLocale }, { url }))
  }
  const meta = extractHeadMeta(html, effectiveLocale, defaultLocale)

  const artefact = (await axios.get(`${config.privateRegistryUrl}/api/v1/artefacts/${encodeURIComponent(artefactId)}`, { headers: registryArtefactHeaders() })).data

  const patch: Partial<BaseApp> = {
    meta,
    id: slug(url, { lower: true }),
    url,
    artefactId,
    version,
    updatedAt: new Date().toISOString(),
    // registry-authoritative metadata
    public: artefact.public === true,
    privateAccess: (artefact.privateAccess ?? []).map((a: any) => ({ type: a.type, id: a.id, name: a.name })),
    deprecated: artefact.deprecated === true
  }
  const title = localizedRegistryField(artefact.title, effectiveLocale)
  if (title) patch.title = title
  const description = localizedRegistryField(artefact.description, effectiveLocale)
  if (description) patch.description = description
  const group = localizedRegistryField(artefact.group, effectiveLocale)
  if (group) patch.category = group
  if (artefact.documentation) patch.documentation = artefact.documentation

  try {
    const rawSchema = JSON.parse(await fsp.readFile(path.join(dir, 'config-schema.json'), 'utf8'))
    if (typeof rawSchema !== 'object') throw new Error('Invalid json')
    const configSchema: any = (await jsonRefs.resolveRefs(rawSchema, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true
    patch.datasetsFilters = deriveDatasetsFilters(configSchema)
  } catch (err) {
    patch.hasConfigSchema = false
    internalError('app-config-schema', err)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw httpError(400, i18n.__({ phrase: 'errors.noAppAtUrl', locale: effectiveLocale }, { url }))
  }
  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = await mongo.baseApplications
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnDocument: 'after' })
  clean(config.publicUrl, storedBaseApp)
  return storedBaseApp as BaseApp
}

// Fetch every 'application' npm artefact visible in the registry, paginating through
// the registry's hard-capped page size (100) with skip-based pages.
async function listAllRegistryAppArtefacts () {
  const pageSize = 100
  const maxPages = 1000 // guard against an infinite loop if the registry misbehaves
  const artefacts: any[] = []
  for (let page = 0; page < maxPages; page++) {
    const { results } = (await axios.get(`${config.privateRegistryUrl}/api/v1/artefacts`, {
      params: { format: 'npm', category: 'application', size: pageSize, skip: page * pageSize, includeDeprecated: 'true' },
      headers: registryArtefactHeaders()
    })).data
    artefacts.push(...results)
    if (results.length < pageSize) break
  }
  return artefacts
}

// Sync every 'application' npm artefact visible in the registry into base-applications.
export async function syncRegistryBaseApps () {
  const failures: { artefactId: string, error: string }[] = []
  let synced = 0
  const artefacts = await listAllRegistryAppArtefacts()
  for (const artefact of artefacts) {
    try {
      const baseApp = await initBaseAppFromArtefact(artefact._id)
      await syncBaseApp(baseApp)
      synced++
    } catch (err: any) {
      internalError('base-app-sync', err)
      failures.push({ artefactId: artefact._id, error: err.message })
    }
  }
  return { synced, failures }
}
