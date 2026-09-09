import mongo from '#mongo'
import moment from 'moment'
import * as webhooks from './webhooks.ts'
import { sendResourceEvent } from './notifications.ts'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { Dataset, Event, Resource, ResourceType } from '#types'

export const log = async function (resourceType: ResourceType, resource: Resource, event: Event, noStoreEvent = false) {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)

  try {
    const db = mongo.db
    event.date = moment().toISOString()
    if ((resource as Dataset).draftReason) event.draft = true

    if (!noStoreEvent) {
      await db.collection('journals')
        .updateOne(
          { id: resource.id, type: singularResourceType, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
          { $push: { events: { $each: [event], $slice: -1000 } } },
          { upsert: true }
        )
    }

    // websockets notifications
    await wsEmitter.emit(`${resourceType}/${resource.id}/journal`, { ...event, store: !noStoreEvent })

    webhooks.trigger(resourceType, resource, event, null)

    // generic `error` journal events fan out to `<resource>-error` here.
    // `validation-error` is NOT handled here: callers that want a notification
    // emit it explicitly via sendResourceEvent('validation-error', ...), which
    // fans out to the `<resource>-error` umbrella with proper i18n params.
    if (event.type === 'error') {
      await sendResourceEvent(resourceType, resource, 'data-fair-worker', 'error', { params: { detail: event.data ?? '' } })
    }
  } catch (err) {
    // errors when writing to journal are never blocking for the actual task
    console.warn('Failure when writing event to journal', err)
  }
}

export const hasErrorRetry = async function (resource: any, resourceType: ResourceType = 'datasets') {
  const singularResourceType = resourceType.substring(0, resourceType.length - 1)
  const journal = await mongo.db.collection('journals')
    .findOne(
      { id: resource.id, type: singularResourceType, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
      { projection: { events: 1 } }
    )

  if (!journal || !journal.events) return false

  // check that we have error-retry message and that no task was succesfully finished since then
  let hasErrorRetry = false
  for (const event of journal.events) {
    if (event.type.endsWith('-end')) hasErrorRetry = false
    if (event.type === 'error-retry') hasErrorRetry = true
  }
  return hasErrorRetry
}
