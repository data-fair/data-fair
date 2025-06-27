import config from '#config'
import axios from './axios.js'
import debugLib from 'debug'
import i18n from 'i18n'
import { internalError } from '@data-fair/lib-node/observer.js'
import eventsQueue, { type PushEvent } from '@data-fair/lib-node/events-queue.js'
import { type AccountKeys, reqUserAuthenticated, type SessionState, type SessionStateAuthenticated } from '@data-fair/lib-express'
import { type ResourceType, type Resource, type Dataset } from '#types'
import * as permissions from './permissions.ts'
import { type Locale } from '../../../i18n/utils.ts'

const debug = debugLib('notifications')

type SendResourceEventOptions = {
  i18nKey?: string
  params?: Record<string, string>
  localizedParams?: Record<Locale, Record<string, string>>
  sender?: AccountKeys
}

export const sendResourceEvent = async (resourceType: ResourceType, resource: Resource, originator: SessionStateAuthenticated | 'string', key: string, options: SendResourceEventOptions = {}) => {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)
  const sender = options.sender ?? { ...resource.owner }
  // @ts-ignore
  delete sender.role
  const fullLabel = `${resource.title} (${resource.slug || resource.id})`
  const titleI18nKey = `notifications.${resourceType}.${options.i18nKey ?? key}.title`
  const bodyI18nKey = `notifications.${resourceType}.${options.i18nKey ?? key}.body`
  if (i18n.__(titleI18nKey) === titleI18nKey) throw new Error('missing i18n for event key ' + titleI18nKey)
  const title = {
    // TODO: truncate title ?
    fr: i18n.__({ phrase: titleI18nKey, locale: 'fr' }, { label: resource.title ?? '', ...options.params, ...options.localizedParams?.fr }),
    en: i18n.__({ phrase: titleI18nKey, locale: 'en' }, { label: resource.title ?? '', ...options.params, ...options.localizedParams?.en })
  }
  const body = {
    fr: i18n.__({ phrase: bodyI18nKey, locale: 'fr' }, { label: fullLabel, ...options.params, ...options.localizedParams?.fr }),
    en: i18n.__({ phrase: bodyI18nKey, locale: 'en' }, { label: fullLabel, ...options.params, ...options.localizedParams?.en })
  }
  const fullKey = (resource as Dataset).draftReason ? `${singularResourceType}-draft-${key}` : `${singularResourceType}-${key}`
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
