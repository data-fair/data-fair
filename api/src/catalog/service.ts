import { type SessionState } from '@data-fair/lib-express'
import mongo from '#mongo'
import * as permissions from '../misc/utils/permissions.ts'
import catalogApiDocs from '../../contract/site-catalog-api-docs.js'
import { rootSettingsFilter } from '../settings/operations.ts'

// datasets published on a publication site, projected to the fields needed for DCAT harvesting
export const findCatalogDatasets = async (publicationSite: any, sessionState: SessionState) => {
  const query = {
    $and: [
      { publicationSites: `${publicationSite.type}:${publicationSite.id}` },
      { $or: permissions.filter(sessionState, 'datasets') }
    ]
  }

  // TODO: pagination ?
  return mongo.db.collection('datasets')
    .find(query)
    .limit(10000)
    .project({
      _id: 0,
      id: 1,
      slug: 1,
      title: 1,
      description: 1,
      keywords: 1,
      license: 1,
      temporal: 1,
      frequency: 1,
      createdAt: 1,
      updatedAt: 1,
      dataUpdatedAt: 1,
      file: 1,
      originalFile: 1,
      summary: 1,
      modified: 1,
      owner: 1,
      creator: 1,
      topics: 1,
      spatial: 1,
      bbox: 1,
      isMetaOnly: 1,
      attachments: 1,
      permissions: 1
    })
    .toArray()
}

// the owner's public info (contact) from its settings
export const getOwnerInfo = async (publicationSite: any) => {
  const settings = await mongo.db.collection('settings')
    .findOne(rootSettingsFilter(publicationSite.owner), { projection: { info: 1 } })
  return settings?.info || {}
}

export const getCatalogApiDocs = async (publicationSite: any, publicBaseUrl: string) => {
  return catalogApiDocs(publicBaseUrl, publicationSite, await getOwnerInfo(publicationSite))
}
