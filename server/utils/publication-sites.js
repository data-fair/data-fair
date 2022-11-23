const webhooks = require('./webhooks')
const permissions = require('./permissions')
const createError = require('http-errors')

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

  const publicationSitesSettings = await db.collection('settings').findOne({
    type: resource.owner.type,
    id: resource.owner.id
  }, { projection: { _id: 0, type: 1, id: 1, department: 1, publicationSites: 1 } })
  if (!publicationSitesSettings) throw createError(404, 'unknown settings')
  publicationSitesSettings.publicationSites = publicationSitesSettings.publicationSites || []
  const publicationSitesSettingsObj = {}
  for (const p of publicationSitesSettings.publicationSites) {
    publicationSitesSettingsObj[`${p.type}:${p.id}`] = p
  }

  // send webhooks/notifs based on changes during this patch
  for (const publicationSite of newPublicationSites) {
    // send a notification either because the publicationSite was added, or because the visibility changed
    if (!previousPublicationSites.includes(publicationSite)) {
      if (!publicationSitesSettingsObj[publicationSite]) throw createError(404, 'unknown publication site')
      if (!user.adminMode && publicationSitesSettings.type === 'organization' && !publicationSitesSettings.department && user.activeAccount.department) {
        throw createError(403, 'publication site does not belong to user department')
      }
      if (!publicationSitesSettingsObj[publicationSite].settings?.staging && !permissions.can(resourceType, resource, 'writePublicationSites', user)) {
        throw createError(403, 'publication site requires permission to publish')
      }
      const sender = { type: publicationSitesSettings.type, id: publicationSitesSettings.id, department: publicationSitesSettings.department }
      webhooks.trigger(db, 'dataset', resource, { type: `published:${publicationSite}` }, sender)
      for (const topic of newTopics) {
        webhooks.trigger(db, 'dataset', resource, { type: `published-topic:${publicationSite}:${topic.id}` }, sender)
      }
    }
  }
  for (const publicationSite of previousPublicationSites) {
    if (!newPublicationSites.includes(publicationSite)) {
      if (!publicationSitesSettingsObj[publicationSite].settings?.staging && !permissions.can(resourceType, resource, 'writePublicationSites', user)) {
        throw createError(403, 'publication site requires permission to publish')
      }
    }
  }
  for (const requestedPublicationSite of newRequestedPublicationSites) {
    // send a notification either because the the publication was requeststed
    if (!previousRequestedPublicationSites.includes(requestedPublicationSite)) {
      if (!publicationSitesSettingsObj[requestedPublicationSite]) throw createError(404, 'unknown publication site')
      const sender = { type: publicationSitesSettings.type, id: publicationSitesSettings.id, department: publicationSitesSettings.department }
      webhooks.trigger(db, 'dataset', resource, { type: `publication-requested:${requestedPublicationSite}`, body: `${resource.title || resource.id} - ${user.name}` }, sender)
    }
  }
  for (const topic of newTopics) {
    // send a notification because the topic was added
    if (!previousTopics.find(t => t.id === topic.id)) {
      for (const publicationSite of newPublicationSites) {
        if (!publicationSitesSettingsObj[publicationSite]) throw createError(404, 'unknown publication site')
        const sender = { type: publicationSitesSettings.type, id: publicationSitesSettings.id, department: publicationSitesSettings.department }
        webhooks.trigger(db, 'dataset', resource, { type: `published-topic:${publicationSite}:${topic.id}` }, sender)
      }
    }
  }
}

// this callback function is called when the resource becomes public
exports.onPublic = (db, patchedResource) => {
  for (const publicationSite of patchedResource.publicationSites || []) {
    webhooks.trigger(db, 'dataset', patchedResource, { type: `published:${publicationSite}` })
    for (const topic of patchedResource.topics || []) {
      webhooks.trigger(db, 'dataset', patchedResource, { type: `published-topic:${publicationSite}:${topic.id}` })
    }
  }
}
