import mongo from '#mongo'
import moment from 'moment'
import * as webhooks from './webhooks.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'

export const log = async function (app, resource, event, type = 'dataset', noStoreEvent = false) {
  try {
    const db = mongo.db
    event.date = moment().toISOString()
    if (resource.draftReason) event.draft = true

    if (!noStoreEvent) {
      await db.collection('journals')
        .updateOne(
          { id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
          { $push: { events: event } },
          { upsert: true }
        )
    }

    // websockets notifications
    await wsEmitter.emit(`${type}s/${resource.id}/journal`, { ...event, store: !noStoreEvent })

    webhooks.trigger(db, type, resource, event)
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
