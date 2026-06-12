import { type SessionState } from '@data-fair/lib-express'
import mongo from '#mongo'
import * as permissions from '../misc/utils/permissions.ts'
import catalogApiDocs from '../../contract/site-catalog-api-docs.js'

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
      originalFile: 1
    })
    .toArray()
}

export const getCatalogApiDocs = async (publicationSite: any, publicBaseUrl: string) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: publicationSite.owner.type, id: publicationSite.owner.id }, { projection: { info: 1 } })
  return catalogApiDocs(publicBaseUrl, publicationSite, (settings && settings.info) || {})
}
