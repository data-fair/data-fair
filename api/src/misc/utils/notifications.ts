import config from '#config'
import axios from './axios.js'
import debugLib from 'debug'
import i18n from 'i18n'
import { internalError } from '@data-fair/lib-node/observer.js'
import eventsQueue, { type PushEvent } from '@data-fair/lib-node/events-queue.js'
import { reqUserAuthenticated, SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'
import { type ResourceType, type Resource, Dataset } from '#types'
import * as permissions from './permissions.ts'

const debug = debugLib('notifications')

export const sendResourceEvent = async (resourceType: ResourceType, resource: Resource, originator: SessionStateAuthenticated | 'string', key: string, extraBody?: string) => {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)
  const fullKey = (resource as Dataset).draftReason ? `${singularResourceType}-draft-${key}` : `${singularResourceType}-${key}`
  const sender = { ...resource.owner }
  delete sender.role
  const fullLabel = `${resource.title} (${resource.slug || resource.id})`
  const title = {
    // TODO: truncate title ?
    fr: i18n.__({ phrase: `${resourceType}.${key}.title`, locale: 'fr' }, { label: resource.title ?? '' }),
    en: i18n.__({ phrase: `${resourceType}.${key}.title`, locale: 'en' }, { label: resource.title ?? '' })
  }
  const body = {
    fr: i18n.__({ phrase: `${resourceType}.${key}.body`, locale: 'fr' }, { label: fullLabel }),
    en: i18n.__({ phrase: `${resourceType}.${key}.body`, locale: 'en' }, { label: fullLabel })
  }
  if (extraBody) {
    body.fr += '\n\n' + extraBody
    body.en += '\n\n' + extraBody
  }
  const event: PushEvent = {
    sender,
    topic: { key: `data-fair:${fullKey}:${resource.slug || resource.id}` },
    title,
    body,
    urlParams: { id: resource.id, slug: resource.slug ?? '' },
    visibility: permissions.isPublic(resourceType, resource) ? 'public' : 'private',
    resource: { type: singularResourceType, id: resource.id, title: resource.title }
  }

  if (typeof originator === 'string') {
    event.originator = { internalProcess: { id: originator } }
    send(event)
  } else {
    send(event, originator)
  }
}

export const send = async (event: PushEvent, sessionState?: SessionState) => {
  if (global.events) global.events.emit('notification', event)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (process.env.NODE_ENV !== 'test') {
    if (config.privateEventsUrl) {
      if (sessionState?.user && (sessionState as SessionState & { isApiKey?: boolean }).isApiKey) {
        event.originator = { apiKey: { id: sessionState.user.id.replace('apiKey:', ''), title: sessionState.user.name } }
      }
      debug('send event to events queue', event)
      eventsQueue.pushEvent(event, sessionState)
    } else if (notifyUrl) {
      const notif = event as any
      delete notif.resource
      let subscribedOnly = false
      if (notif.subscribedRecipient) {
        subscribedOnly = true
        notif.recipient = notif.subscribedRecipient
        delete notif.subscribedRecipient
      }
      debug('send notification to old notifications endpoint', event)
      await axios.post(`${notifyUrl}/api/v1/notifications`, event, { params: { key: config.secretKeys.notifications, subscribedOnly } })
        .catch(err => { internalError('notif-push', err) })
    }
  }
}

export const subscribe = async (req, subscription) => {
  const user = reqUserAuthenticated(req)
  subscription = {
    recipient: { id: user.id, name: user.name },
    ...subscription
  }
  debug('send subscription', subscription)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  await axios.post(`${notifyUrl}/api/v1/subscriptions`, subscription, { headers: { cookie: req.headers.cookie } })
    .catch(err => { internalError('subscribe-push', err) })
}
