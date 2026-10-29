import mongo from '#mongo'
import axios from './axios.ts'
import config from '#config'
import settingsSchema from '#types/settings/schema.js'
import debugLib from 'debug'
import type { Resource, Dataset, ResourceType } from '#types'
import testEvents from './test-events.ts'
import log from '@data-fair/lib-node/log.js'

const debug = debugLib('webhooks')

// `event` here is a webhook-trigger event, not a journal Event: trigger only reads type/href/data
// (and tolerates an unused `body` some callers pass). `sender` is currently unused.
export const trigger = async (resourceType: ResourceType, resource: Resource, event: { type: string, href?: string, data?: string, body?: any }, sender?: any) => {
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
  // trigger is always called fire-and-forget, so a mongo error on this lookup must not become an unhandled rejection
  let settings
  try {
    settings = await mongo.settings.findOne(settingsFilter) || {}
  } catch (err) {
    return log.error('failed to read webhook settings', { code: 'webhook-settings', err })
  }
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
        const payload = { text, href, event: event.type }
        await axios.post(webhook.target.params.url, payload)
        if (process.env.NODE_ENV === 'development') {
          testEvents.emit('webhook', payload)
        }
      }
    } catch (err) {
      // not the whole webhook settings entry: its target url can embed credentials
      log.warn('failure to send webhook', { code: 'webhook-send', webhookTitle: webhook.title, event: event.type, err })
    }
  }
}
