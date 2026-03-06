import axios from 'axios'
import config from '#config'
import mongo from '#mongo'
import { buildPostSearchPage, extractPortalId } from './utils.ts'
import debugModule from 'debug'

const debug = debugModule('search-pages-webhook')

export type ResourceWithOwner = {
  id: string
  owner: { type: 'user' | 'organization'; id: string; name: string; department?: string; departmentName?: string }
  permissions?: { type?: 'user' | 'organization'; id?: string; name?: string; email?: string; department?: string; departmentName?: string; roles?: string[]; operations?: string[]; classes?: string[] }[]
  publicationSites?: string[]
  extras?: { applications?: { id: string; slug: string }[] }
  configuration?: { datasets?: { id?: string; href?: string }[] }
}

const sendToPortals = async (searchPage: any) => {
  if (!config.privatePortalsManagerUrl || !config.secretKeys.searchPages) {
    console.warn('Portals integration not configured, skipping webhook')
    return
  }

  try {
    debug('POST search-pages', searchPage)
    await axios.post(`${config.privatePortalsManagerUrl}/api/search-pages`, searchPage, {
      headers: {
        Authorization: `Bearer ${config.secretKeys.searchPages}`
      },
      timeout: 10000
    })
  } catch (err: any) {
    console.error('Failed to send search page to portals:', err.message)
  }
}

export const notifyPortals = async (
  resource: ResourceWithOwner,
  resourceType: 'dataset' | 'application',
  indexingStatus: 'toIndex' | 'toDelete'
) => {
  debug('notifyPortals ?', resourceType, resource.id)
  const publicationSites = resource.publicationSites || []
  const searchPages: any[] = []
  const rt = resourceType === 'dataset' ? 'datasets' : 'applications'

  for (const publicationSite of publicationSites) {
    const portalId = extractPortalId(publicationSite)
    if (!portalId) continue

    const searchPage = buildPostSearchPage(
      rt,
      {
        id: resource.id,
        owner: resource.owner,
        permissions: resource.permissions
      },
      portalId,
      indexingStatus
    )
    searchPages.push(searchPage)
  }

  if (indexingStatus === 'toIndex' && resourceType === 'dataset') {
    const linkedApplications = await mongo.applications
      .find({
        'owner.type': resource.owner.type,
        'owner.id': resource.owner.id,
        'configuration.datasets.id': resource.id
      })
      .project({ id: 1, owner: 1, permissions: 1, publicationSites: 1 })
      .toArray()

    for (const app of linkedApplications) {
      const appPublicationSites = app.publicationSites || []
      for (const publicationSite of appPublicationSites) {
        const portalId = extractPortalId(publicationSite)
        if (!portalId) continue

        const searchPage = buildPostSearchPage(
          'applications',
          {
            id: app.id,
            owner: app.owner,
            permissions: app.permissions
          },
          portalId,
          'toIndex'
        )
        searchPages.push(searchPage)
      }
    }
  }

  if (indexingStatus === 'toIndex' && resourceType === 'application') {
    const linkedDatasets = await mongo.datasets
      .find({
        'owner.type': resource.owner.type,
        'owner.id': resource.owner.id,
        'extras.applications.id': resource.id
      })
      .project({ id: 1, owner: 1, permissions: 1, publicationSites: 1 })
      .toArray()

    for (const dataset of linkedDatasets) {
      const datasetPublicationSites = dataset.publicationSites || []
      for (const publicationSite of datasetPublicationSites) {
        const portalId = extractPortalId(publicationSite)
        if (!portalId) continue

        const searchPage = buildPostSearchPage(
          'datasets',
          {
            id: dataset.id,
            owner: dataset.owner,
            permissions: dataset.permissions
          },
          portalId,
          'toIndex'
        )
        searchPages.push(searchPage)
      }
    }
  }

  for (const searchPage of searchPages) {
    await sendToPortals(searchPage)
  }
}
