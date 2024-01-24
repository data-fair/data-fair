const axios = require('./axios')
const config = require('config')
const settingsSchema = require('../../../contract/settings')
const notifications = require('./notifications')
const permissions = require('./permissions')
const debug = require('debug')('webhooks')

exports.trigger = async (db, type, resource, event, sender) => {
  const eventKey = resource.draftReason ? `${type}-draft-${event.type}` : `${type}-${event.type}`
  const eventType = settingsSchema.properties.webhooks.items.properties.events.items.oneOf
    .find(eventType => eventType.const === eventKey)
  if (!eventType && !(event.type.includes('published:') || event.type.includes('published-topic:') || event.type.includes('publication-requested:'))) {
    return debug('Unknown webhook event type', type, event.type)
  }
  // first send notifications before actual webhooks
  sender = sender || { ...resource.owner }
  delete sender.role
  const notif = {
    sender,
    topic: { key: `data-fair:${eventKey}:${resource.slug || resource.id}` },
    title: eventType ? eventType.title : '',
    // body: event.data || '',
    body: event.body || resource.title || resource.id,
    urlParams: { id: resource.id, slug: resource.slug },
    visibility: permissions.isPublic(type + 's', resource) ? 'public' : 'private'
  }
  if (event.data) notif.body += ' - ' + event.data
  notifications.send(notif)

  const settingsFilter = {
    id: resource.owner.id,
    type: resource.owner.type,
    department: resource.owner.department || { $exists: false }
  }
  const settings = await db.collection('settings').findOne(settingsFilter) || {}
  settings.webhooks = settings.webhooks || []
  for (const webhook of settings.webhooks) {
    if (webhook.events && webhook.events.length && !webhook.events.includes(`${type}-${event.type}`)) continue
    debug(`Trigger webhook for event ${event.type}`, webhook)

    const href = `${config.publicUrl}/api/v1/${type}s/${resource.id}`
    try {
      // Simple HTTP POST (mattermost, etc.)
      if (webhook.target.type === 'http') {
        let text = (resource.title || resource.id) + ' - ' + eventType.title + (event.href ? ' - ' + event.href : '')
        if (event.data) text += '\n\n' + event.data
        await axios.post(webhook.target.params.url, {
          text,
          href,
          event: event.type
        })
      }
    } catch (err) {
      console.log('Failure to send Webhook', webhook, err)
    }
  }
}
