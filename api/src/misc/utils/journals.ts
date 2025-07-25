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

    if (event.type === 'error') {
      // other notifs/events are sent explicitly not through journals.log for greater control
      // except for error for simplicity
      await sendResourceEvent(resourceType, resource, 'data-fair-worker', 'error', { params: { detail: event.data ?? '' } })
    }
  } catch (err) {
    // errors when writing to journal are never blocking for the actual task
    console.warn('Failure when writing event to journal')
  }
}

export const hasErrorRetry = async function (db, resource, type = 'dataset') {
  const journal = await db.collection('journals')
    .findOne(
      { id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
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
