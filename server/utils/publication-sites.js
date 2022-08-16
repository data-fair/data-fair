const webhooks = require('./webhooks')
const createError = require('http-errors')

// this function is called when the resource is patched to check if publicationSites and requestedPublicationSites have changed
exports.applyPatch = async (db, previousResource, resource, user) => {
  const previousPublicationSites = previousResource.publicationSites || []
  const previousRequestedPublicationSites = previousResource.requestedPublicationSites || []
  const previousTopics = previousResource.topics || []

  // send webhooks/notifs based on changes during this patch
  const newPublicationSites = resource.publicationSites || []
  const newTopics = resource.topics || []
  const getPublicationSiteSettings = async (publicationSite) => {
    return db.collection('settings').findOne({
      publicationSites: { $elemMatch: { type: publicationSite.split(':')[0], id: publicationSite.split(':')[1] } },
      type: resource.owner.type,
      id: resource.owner.id
    }, { projection: { _id: 0, type: 1, id: 1, department: 1, publicationSites: 1 } })
  }
  for (const publicationSite of newPublicationSites) {
    // send a notification either because the publicationSite was added, or because the visibility changed
    if (!previousPublicationSites.includes(publicationSite)) {
      const publicationSiteSettings = await getPublicationSiteSettings(publicationSite)
      if (!publicationSiteSettings) throw createError(404, 'unknown publication site')
      if (!user.adminMode && publicationSiteSettings.type === 'organization' && !publicationSiteSettings.department && user.activeAccount.department) {
        throw createError(403, 'publication site does not belong to user department')
      }
      const sender = { type: publicationSiteSettings.type, id: publicationSiteSettings.id, department: publicationSiteSettings.department }
      webhooks.trigger(db, 'dataset', resource, { type: `published:${publicationSite}` }, sender)
      for (const topic of newTopics) {
        webhooks.trigger(db, 'dataset', resource, { type: `published-topic:${publicationSite}:${topic.id}` }, sender)
      }
    }
  }
  const newRequestedPublicationSites = resource.requestedPublicationSites || []
  for (const requestedPublicationSite of newRequestedPublicationSites) {
    // send a notification either because the the publication was requeststed
    if (!previousRequestedPublicationSites.includes(requestedPublicationSite)) {
      const publicationSiteSettings = await getPublicationSiteSettings(requestedPublicationSite)
      if (!publicationSiteSettings) throw createError(404, 'unknown publication site')
      const sender = { type: publicationSiteSettings.type, id: publicationSiteSettings.id, department: publicationSiteSettings.department }
      webhooks.trigger(db, 'dataset', resource, { type: `publication-requested:${requestedPublicationSite}`, body: `${resource.title || resource.id} - ${user.name}` }, sender)
    }
  }
  for (const topic of newTopics) {
    // send a notification because the topic was added
    if (!previousTopics.find(t => t.id === topic.id)) {
      for (const publicationSite of newPublicationSites) {
        const publicationSiteSettings = await getPublicationSiteSettings(publicationSite)
        if (!publicationSiteSettings) throw createError(404, 'unknown publication site')
        const sender = { type: publicationSiteSettings.type, id: publicationSiteSettings.id, department: publicationSiteSettings.department }
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
