import config from '#config'
import mongo from '#mongo'
import axios from './axios.js'
import debugLib from 'debug'
import i18n from 'i18n'
import { nanoid } from 'nanoid'
import { internalError } from '@data-fair/lib-node/observer.js'
import eventsQueue, { type PushEvent } from '@data-fair/lib-node/events-queue.js'
import { type AccountKeys, reqUserAuthenticated, type SessionState, type SessionStateAuthenticated } from '@data-fair/lib-express'
import { type ResourceType, type Resource, type Dataset } from '#types'
import * as permissions from './permissions.ts'
import { type Locale } from '../../../i18n/utils.ts'
import { isMainThread, parentPort } from 'node:worker_threads'
import testEvents from './test-events.ts'

const debug = debugLib('notifications')

type SendResourceEventOptions = {
  i18nKey?: string
  params?: Record<string, string>
  localizedParams?: Record<Locale, Record<string, string>>
  sender?: AccountKeys
  extra?: Record<string, unknown>
}

export const sendResourceEvent = async (resourceType: ResourceType, resource: Resource, originator: SessionStateAuthenticated | string, key: string, options: SendResourceEventOptions = {}) => {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)
  const sender = options.sender ?? { ...resource.owner }
  // @ts-ignore
  delete sender.role
  const fullLabel = `${resource.title} (${resource.slug || resource.id})`
  const draftPrefix = (resource as Dataset).draftReason ? 'draft-' : ''
  const titleI18nKey = `notifications.${resourceType}.${draftPrefix}${options.i18nKey ?? key}.title`
  const bodyI18nKey = `notifications.${resourceType}.${draftPrefix}${options.i18nKey ?? key}.body`
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
  // see notifications.md §3 (error umbrella) and §12 (dual slug/id emission)
  const umbrellaKey = `${singularResourceType}-error`
  const emitUmbrella = (key === 'error' || key === 'validation-error') && fullKey !== umbrellaKey
  const eventId = nanoid()
  const slug = resource.slug
  const buildEvent = (topicKey: string, topicTail: string): PushEvent => ({
    _id: eventId,
    sender,
    topic: { key: `data-fair:${topicKey}:${topicTail}` },
    title,
    body,
    urlParams: { id: resource.id, slug: slug ?? '' },
    visibility: permissions.isPublic(resourceType, resource) ? 'public' : 'private',
    resource: { type: singularResourceType, id: resource.id, title: resource.title },
    extra: options.extra
  })

  // id+specific first wins the events-service _id unique index → stored event keeps the canonical shape
  const topicTails = slug && slug !== resource.id ? [resource.id, slug] : [resource.id]
  const topicKeys = emitUmbrella ? [fullKey, umbrellaKey] : [fullKey]

  for (const topicTail of topicTails) {
    for (const topicKey of topicKeys) {
      const event = buildEvent(topicKey, topicTail)
      if (typeof originator === 'string') {
        event.originator = { internalProcess: { id: originator } }
        await send(event)
      } else {
        await send(event, originator)
      }
    }
  }
}

// Mirror a child dataset's data-updated emission on every parent virtual dataset
// referencing it via `virtual.children`. Same i18nKey/localizedParams are passed
// through so portal-side subscribers see a uniform body, with no leakage of child
// identity or virtual-ness. The mongo lookup uses the `virtual.children_1` index.
export const propagateDataUpdatedToVirtualParents = async (
  childDataset: Pick<Dataset, 'id'>,
  originator: SessionStateAuthenticated | string,
  options: Pick<SendResourceEventOptions, 'i18nKey' | 'localizedParams' | 'params' | 'extra'> = {}
) => {
  for await (const virtualParent of mongo.datasets.find({ 'virtual.children': childDataset.id })) {
    await sendResourceEvent('datasets', virtualParent, originator, 'data-updated', options)
  }
}

export const send = async (event: PushEvent, sessionState?: SessionState) => {
  if (!isMainThread) {
    // Piscina suspends idle workers via Atomics.wait, blocking the events-queue
    // setTimeout drain loop. Forward to the main thread (handled in workers/tasks.ts).
    // @ts-ignore
    parentPort?.postMessage(event)
    return
  }
  if (process.env.NODE_ENV === 'development') {
    testEvents.emit('notification', event)
    const { capturedNotifications } = await import('./test-notif-buffer.ts')
    capturedNotifications.push(event)
  }
  if (config.privateEventsUrl) {
    if (sessionState?.user && (sessionState as SessionState & { isApiKey?: boolean }).isApiKey) {
      event.originator = { apiKey: { id: sessionState.user.id.replace('apiKey:', ''), title: sessionState.user.name } }
    }
    debug('send event to events queue', event)
    eventsQueue.pushEvent(event, sessionState)
  }
}

export const subscribe = async (req, subscription) => {
  const user = reqUserAuthenticated(req)
  subscription = {
    recipient: { id: user.id, name: user.name },
    ...subscription
  }
  debug('send subscription', subscription)
  await axios.post(`${config.privateEventsUrl}/api/v1/subscriptions`, subscription, { headers: { cookie: req.headers.cookie } })
    .catch(err => { internalError('subscribe-push', err) })
}
