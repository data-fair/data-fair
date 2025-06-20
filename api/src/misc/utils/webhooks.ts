import mongo from '#mongo'
import axios from './axios.js'
import config from '#config'
import settingsSchema from '../../../contract/settings.js'
import debugLib from 'debug'
import { Resource, Event, Dataset } from '#types'

const debug = debugLib('webhooks')

export const trigger = async (type: string, resource: Resource, event: Event, sender) => {
  const eventKey = (resource as Dataset).draftReason ? `${type}-draft-${event.type}` : `${type}-${event.type}`
  const eventType = settingsSchema.properties.webhooks.items.properties.events.items.oneOf
    .find(eventType => eventType.const === eventKey)
  if (!eventType) {
    return debug('Unknown webhook event type', type, event.type)
  }

  const settingsFilter = {
    id: resource.owner.id,
    type: resource.owner.type,
    department: resource.owner.department || { $exists: false }
  }
  const settings = await mongo.settings.findOne(settingsFilter) || {}
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
