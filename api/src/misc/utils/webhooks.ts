import mongo from '#mongo'
import axios from './axios.js'
import config from '#config'
import settingsSchema from '#types/settings/schema.js'
import debugLib from 'debug'
import type { Resource, Event, Dataset, ResourceType } from '#types'

const debug = debugLib('webhooks')

export const trigger = async (resourceType: ResourceType, resource: Resource, event: Event, sender) => {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)
  const eventKey = (resource as Dataset).draftReason ? `${singularResourceType}-draft-${event.type}` : `${singularResourceType}-${event.type}`
  const eventType = settingsSchema.properties.webhooks.items.properties.events.items.oneOf
    .find(eventType => eventType.const === eventKey)
  if (!eventType) {
    return debug('Unknown webhook event type', singularResourceType, event.type)
  }

  const settingsFilter = {
    id: resource.owner.id,
    type: resource.owner.type,
    department: resource.owner.department || { $exists: false }
  }
  const settings = await mongo.settings.findOne(settingsFilter) || {}
  settings.webhooks = settings.webhooks || []
  for (const webhook of settings.webhooks) {
    if (webhook.events && webhook.events.length && !webhook.events.includes(`${singularResourceType}-${event.type}`)) continue
    debug(`Trigger webhook for event ${event.type}`, webhook)

    const href = `${config.publicUrl}/api/v1/${resourceType}/${resource.id}`
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
