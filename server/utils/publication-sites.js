const webhooks = require('./webhooks')
const permissions = require('./permissions')
const createError = require('http-errors')

const getPublicationSiteInfo = async (db, owner, publicationSite) => {
  const [type, id] = publicationSite.split(':')
  const settings = await db.collection('settings')
    .findOne(
      { type: owner.type, id: owner.id, publicationSites: { $elemMatch: { type, id } } },
      { projection: { department: 1, publicationSites: { $elemMatch: { type, id } } } }
    )
  if (!settings) return null
  return { ...settings.publicationSites[0], department: settings.department }
}

// this function is called when the resource is patched to check if publicationSites and requestedPublicationSites have changed
exports.applyPatch = async (db, previousResource, resource, user, resourceType) => {
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
  if (!publicationSitesSettings) throw createError(404, 'unknown settings')
  publicationSitesSettings.publicationSites = publicationSitesSettings.publicationSites || []
  const publicationSitesSettingsObj = {}
  for (const p of publicationSitesSettings.publicationSites) {
    publicationSitesSettingsObj[`${p.type}:${p.id}`] = p
  } */

  // send webhooks/notifs based on changes during this patch
  for (const publicationSite of newPublicationSites) {
    // send a notification either because the publicationSite was added, or because the visibility changed
    if (!previousPublicationSites.includes(publicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(db, resource.owner, publicationSite)
      if (!publicationSiteInfo) throw createError(404, 'unknown publication site')
      if (!user.adminMode && resource.owner.type === 'organization' && user.activeAccount.type === 'organization' && user.activeAccount.id === resource.owner.id && !publicationSiteInfo.department && user.activeAccount.department) {
        throw createError(403, 'publication site does not belong to user department')
      }
      if (!publicationSiteInfo.settings?.staging && !permissions.can(resourceType + 's', resource, 'writePublicationSites', user)) {
        throw createError(403, 'publication site requires permission to publish')
      }
      const sender = { type: resource.owner.type, id: resource.owner.id, department: publicationSiteInfo.department }
      webhooks.trigger(db, resourceType, resource, { type: `published:${publicationSite}` }, sender)
      for (const topic of newTopics) {
        webhooks.trigger(db, resourceType, resource, { type: `published-topic:${publicationSite}:${topic.id}` }, sender)
      }
    }
  }
  for (const publicationSite of previousPublicationSites) {
    if (!newPublicationSites.includes(publicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(db, resource.owner, publicationSite)
      if (!user.adminMode && resource.owner.type === 'organization' && user.activeAccount.type === 'organization' && user.activeAccount.id === resource.owner.id && !publicationSiteInfo.department && user.activeAccount.department) {
        throw createError(403, 'publication site does not belong to user department')
      }
      if (publicationSiteInfo && !publicationSiteInfo.settings?.staging && !permissions.can(resourceType + 's', resource, 'writePublicationSites', user)) {
        throw createError(403, 'publication site requires permission to unpublish')
      }
    }
  }
  for (const requestedPublicationSite of newRequestedPublicationSites) {
    // send a notification because the publication was requeststed
    if (!previousRequestedPublicationSites.includes(requestedPublicationSite)) {
      const publicationSiteInfo = await getPublicationSiteInfo(db, resource.owner, requestedPublicationSite)
      if (!publicationSiteInfo) throw createError(404, 'unknown publication site')
      const sender = { type: resource.owner.type, id: resource.owner.id, department: publicationSiteInfo.department }
      webhooks.trigger(db, resourceType, resource, { type: `publication-requested:${requestedPublicationSite}`, body: `${resource.title || resource.id} - ${user.name}` }, sender)
    }
  }
  for (const topic of newTopics) {
    // send a notification because the topic was added
    if (!previousTopics.find(t => t.id === topic.id)) {
      for (const publicationSite of newPublicationSites) {
        const publicationSiteInfo = await getPublicationSiteInfo(db, resource.owner, publicationSite)
        if (!publicationSiteInfo) throw createError(404, 'unknown publication site')
        const sender = { type: resource.owner.type, id: resource.owner.id, department: publicationSiteInfo.department }
        webhooks.trigger(db, resourceType, resource, { type: `published-topic:${publicationSite}:${topic.id}` }, sender)
      }
    }
  }
}

// this callback function is called when the resource becomes public
exports.onPublic = (db, patchedResource, resourceType) => {
  for (const publicationSite of patchedResource.publicationSites || []) {
    webhooks.trigger(db, resourceType, patchedResource, { type: `published:${publicationSite}` })
    for (const topic of patchedResource.topics || []) {
      webhooks.trigger(db, resourceType, patchedResource, { type: `published-topic:${publicationSite}:${topic.id}` })
    }
  }
}
