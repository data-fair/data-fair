import mongo from '#mongo'
import axios from '../misc/utils/axios.js'
import { internalError } from '@data-fair/lib-node/observer.js'

// module-private HTML response cache (keyed by cleanApplicationUrl)
const htmlCache: Record<string, { content: any, etag?: string, lastModified?: string, fetchedAt: Date }> = {}

// exported for the /_htmlcache debug route (Task 5 uses it)
export const getHtmlCache = () => htmlCache

export const matchApplicationKey = async (application: any, applicationKeyId: string, ownerFilter: Record<string, any>): Promise<boolean> => {
  const applicationKey = await mongo.db.collection('applications-keys')
    .findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
  if (applicationKey) {
    if (applicationKey._id === application.id) {
      return true
    } else {
      // ths application key can be matched to a parent application key (case of dashboards, etc)
      const isParentApplicationKey = await mongo.db.collection('applications')
        .countDocuments({ id: applicationKey._id, 'configuration.applications.id': application.id, ...ownerFilter })
      if (isParentApplicationKey) {
        return true
      }
    }
  }
  return false
}

export const getManifestBaseApp = (url: string) => {
  return mongo.db.collection('base-applications').findOne({ url }, { projection: { id: 1, meta: 1 } })
}

export const getProxyBaseAppAndLimits = (application: any, applicationUrl: string, accessFilter: any[]) => {
  const db = mongo.db
  return Promise.all([
    db.collection('limits').findOne({ type: application.owner.type, id: application.owner.id }),
    db.collection('base-applications').findOne({ url: applicationUrl, $or: accessFilter }, { projection: { id: 1, meta: 1 } })
  ])
}

export const fetchHTML = async (cleanApplicationUrl: string, targetUrl: any) => {
  const cacheEntry = htmlCache[cleanApplicationUrl]
  try {
    // search params should not be interpreted by the static application server
    delete targetUrl.search
    const headers: Record<string, string> = {}
    if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag
    if (cacheEntry?.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified
    const res = await axios.get(targetUrl.href, {
      headers,
      validateStatus: function (status) {
        return status === 200 || status === 304
      }
    })
    if (res.status === 304) {
      return cacheEntry.content
    } else {
      htmlCache[cleanApplicationUrl] = {
        content: res.data,
        etag: res.headers.etag,
        lastModified: res.headers['last-modified'],
        fetchedAt: new Date()
      }
      return res.data
    }
  } catch (err) {
    internalError('app-fetch', err)
    if (cacheEntry) return cacheEntry.content
    throw err
    // in case of failure, serve from simple cache
  }
}
