import mongo from '#mongo'
import * as permissions from './permissions.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type SessionStateAuthenticated, type AccountKeys } from '@data-fair/lib-express'
import { type Resource, type ResourceType } from '#types'
import { sendResourceEvent } from './notifications.ts'
import { type DepartmentSettings } from '#types/department-settings/index.js'

const getPublicationSiteInfo = async (owner: AccountKeys, publicationSite: string) => {
  const [type, id] = publicationSite.split(':')
  const settings = await mongo.settings
    .findOne(
      { type: owner.type, id: owner.id, publicationSites: { $elemMatch: { type, id } } },
      { projection: { department: 1, publicationSites: { $elemMatch: { type, id } } } }
    )
  if (!settings?.publicationSites?.[0]) return null
  return { ...settings.publicationSites[0], department: (settings as DepartmentSettings).department }
}

// this function is called when the resource is patched to check if publicationSites and requestedPublicationSites have changed
export const applyPatch = async (previousResource: Resource, resource: Resource, sessionState: SessionStateAuthenticated, resourceType: ResourceType) => {
  const previousPublicationSites = previousResource.publicationSites || []
  const previousRequestedPublicationSites = previousResource.requestedPublicationSites || []
  const previousTopics = previousResource.topics || []
  const newPublicationSites = resource.publicationSites || []
  const newRequestedPublicationSites = resource.requestedPublicationSites || []
  const newTopics = resource.topics || []

  if (!previousPublicationSites.length && !previousRequestedPublicationSites.length && !newPublicationSites.length && !newRequestedPublicationSites.length) {
    return
  }

  /* const publicationSitesSettings = await db.collection('settings').findOne({
    type: resource.owner.type,
    id: resource.owner.id
  }, { projection: { _id: 0, type: 1, id: 1, department: 1, publicationSites: 1 } })
  if (!publicationSitesSettings) throw httpError(404, 'unknown settings')
  publicationSitesSettings.publicationSites = publicationSitesSettings.publicationSites || []
  const publicationSitesSettingsObj = {}
  for (const p of publicationSitesSettings.publicationSites) {
    publicationSitesSettingsObj[`${p.type}:${p.id}`] = p
  } */

  // send webhooks/notifs based on changes during this patch
  for (const publicationSite of newPublicationSites) {
    // send a notification either because the publicationSite was added, or because the visibility changed
    if (!previousPublicationSites.includes(publicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(resource.owner, publicationSite)
      if (!publicationSiteInfo) throw httpError(404, 'unknown publication site')
      if (!sessionState.user.adminMode && !publicationSiteInfo.settings?.staging && resource.owner.type === 'organization' && sessionState.account?.type === 'organization' && sessionState.account.id === resource.owner.id && !publicationSiteInfo.department && sessionState.account.department) {
        throw httpError(403, 'fail to publish: publication site does not belong to user department')
      }
      if (!publicationSiteInfo.settings?.staging && !permissions.can(resourceType, resource, 'writePublicationSites', sessionState)) {
        throw httpError(403, 'fail to publish: publication site requires permission to publish')
      }
      await sendResourceEvent(resourceType, resource, sessionState, `published:${publicationSite}`)
      for (const topic of newTopics) {
        await sendResourceEvent(resourceType, resource, sessionState, `published-topic:${publicationSite}:${topic.id}`)
      }
    }
  }
  for (const publicationSite of previousPublicationSites) {
    if (!newPublicationSites.includes(publicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(resource.owner, publicationSite)
      if (!publicationSiteInfo) throw httpError(404, 'unknown publication site')
      if (!sessionState.user.adminMode && !publicationSiteInfo.settings?.staging && resource.owner.type === 'organization' && sessionState.account?.type === 'organization' && sessionState.account.id === resource.owner.id && !publicationSiteInfo.department && sessionState.account.department) {
        throw httpError(403, 'fail to unpublish: publication site does not belong to user department')
      }
      if (publicationSiteInfo && !publicationSiteInfo.settings?.staging && !permissions.can(resourceType, resource, 'writePublicationSites', sessionState)) {
        throw httpError(403, 'fail to unpublish: publication site requires permission to unpublish')
      }
    }
  }
  for (const requestedPublicationSite of newRequestedPublicationSites) {
    // send a notification because the publication was requeststed
    if (!previousRequestedPublicationSites.includes(requestedPublicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(resource.owner, requestedPublicationSite)
      if (!publicationSiteInfo) throw httpError(404, 'unknown publication site')
      await sendResourceEvent(resourceType, resource, sessionState, `publication-requested:${requestedPublicationSite}`, {
        i18nKey: 'publication-requested',
        params: { publicationSite: publicationSiteInfo.title ?? new URL(publicationSiteInfo.url).host },
        sender: { type: resource.owner.type, id: resource.owner.id, department: publicationSiteInfo.department }
      })
    }
  }
  for (const topic of newTopics) {
    // send a notification because the topic was added
    if (!previousTopics.find(t => t.id === topic.id)) {
      for (const publicationSite of newPublicationSites) {
        const publicationSiteInfo = await getPublicationSiteInfo(resource.owner, publicationSite)
        if (!publicationSiteInfo) throw httpError(404, 'unknown publication site')
        await sendResourceEvent(resourceType, resource, sessionState, `published-topic:${publicationSite}:${topic.id}`, {
          i18nKey: 'published-topic',
          params: { publicationSite: publicationSiteInfo.title ?? new URL(publicationSiteInfo.url).host },
          sender: { type: resource.owner.type, id: resource.owner.id, department: publicationSiteInfo.department }
        })
      }
    }
  }
}

// this callback function is called when the resource becomes public
export const onPublic = async (patchedResource: Resource, resourceType: ResourceType, sessionState: SessionStateAuthenticated) => {
  for (const publicationSite of patchedResource.publicationSites || []) {
    const publicationSiteInfo = await getPublicationSiteInfo(patchedResource.owner, publicationSite)
    if (!publicationSiteInfo) throw httpError(404, 'unknown publication site')
    await sendResourceEvent(resourceType, patchedResource, sessionState, `published:${publicationSite}`, {
      i18nKey: 'published',
      params: { publicationSite: publicationSiteInfo.title ?? new URL(publicationSiteInfo.url).host },
      sender: { type: patchedResource.owner.type, id: patchedResource.owner.id, department: publicationSiteInfo.department }
    })
    for (const topic of patchedResource.topics || []) {
      await sendResourceEvent(resourceType, patchedResource, sessionState, `published-topic:${publicationSite}:${topic.id}`, {
        i18nKey: 'published-topic',
        params: { publicationSite: publicationSiteInfo.title ?? new URL(publicationSiteInfo.url).host },
        sender: { type: patchedResource.owner.type, id: patchedResource.owner.id, department: publicationSiteInfo.department }
      })
    }
  }
}
