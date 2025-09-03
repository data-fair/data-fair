// write messages to a mongodb collection/queue for publication by ws-server.js and consumption by ws.js

import mongo from '#mongo'
import type { ResourceType } from '#types'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { Collection, FindCursor } from 'mongodb'
import debugLib from 'debug'

const debug = debugLib('workers')

let messagesCollection: Collection | undefined

// prepare a capped mongodb collection that acts as a simple queue
export const init = async () => {
  const collection = (await mongo.db.listCollections({ name: 'ping-workers' }).toArray())[0]
  if (!collection) await mongo.db.createCollection('ping-workers', { capped: true, size: 10000, max: 100 })
  messagesCollection = mongo.db.collection('ping-workers')
}

export const emit = async (type: ResourceType, id: string) => {
  if (!messagesCollection) await init()
  const message = { type, id, date: new Date().toISOString() }
  debug('insert ping message', message)
  await messagesCollection!.insertOne(message)
}

let cursor: FindCursor
let stopped = false
let nbCursors = 0
let startDate = new Date().toISOString()

export const stop = async () => {
  stopped = true
  if (cursor) await cursor.close()
}

export const reset = async () => {
  startDate = new Date().toISOString()
}

export const listen = async (callback: (type: ResourceType, id: string) => Promise<void>) => {
  debug('listen for ping messages')
  while (true) {
    if (stopped) break
    if (nbCursors > 0) {
      startDate = new Date().toISOString()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    nbCursors++
    try {
      debug('create ping messages cursor', nbCursors, startDate)
      cursor = messagesCollection!.find({}, { tailable: true, awaitData: true })
      for await (const doc of cursor) {
        debug('receive ping message', doc, startDate)
        if (doc.date && doc.date < startDate) continue
        callback(doc.type, doc.id).catch(err => internalError('worker-ping-callback', err))
      }
    } catch (err: any) {
      if (stopped) break
      console.log('worker ping tailable cursor was interrupted, reinit it', err && err.message)
    }
  }
}
