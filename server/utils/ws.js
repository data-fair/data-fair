// Simple subscribe mechanism to follow channels of messages from the server
// Bodies are simple JSON objects following theses conventions:

/*
Upstream examples:
{type: 'subscribe', channel: 'my_channel'}
{type: 'unsubscribe', channel: 'my_channel'}

Downstream examples:
{type: 'subscribe-confirm', channel: 'my_channel'}
{type: 'unsubscribe-confirm', channel: 'my_channel'}
{type: 'message', channel: 'my_channel', data: {...}}
{type: 'error', data: {...}}
*/
const { nanoid } = require('nanoid')
const permissions = require('./permissions')
const { readApiKey } = require('./api-key')

let cursor
const subscribers = {}
const clients = {}

let stopped = false
exports.stop = async () => {
  stopped = true
  if (cursor) await cursor.close()
}

async function channel (db) {
  const collection = (await db.listCollections({ name: 'messages' }).toArray())[0]
  if (!collection) await db.createCollection('messages', { capped: true, size: 100000, max: 1000 })
  return db.collection('messages')
}

exports.initServer = async (wss, db, session) => {
  wss.on('connection', (ws, req) => {
    session.auth(req, null, () => {
      // Associate ws connections to ids for subscriptions
      const clientId = nanoid()
      clients[clientId] = ws

      // Manage subscribe/unsubscribe demands
      ws.on('message', async str => {
        try {
          if (stopped) return
          const message = JSON.parse(str)
          if (!message.type || ['subscribe', 'unsubscribe'].indexOf(message.type) === -1) {
            return ws.send(JSON.stringify({ type: 'error', data: 'type should be "subscribe" or "unsubscribe"' }))
          }
          if (!message.channel) {
            return ws.send(JSON.stringify({ type: 'error', data: '"channel" is required' }))
          }
          if (message.type === 'subscribe') {
            if (process.env.NODE_ENV !== 'test') {
              const [type, id, subject] = message.channel.split('/')
              const resource = await db.collection(type).findOne({ id })
              if (!resource) return ws.send(JSON.stringify({ type: 'error', status: 404, data: `Ressource ${type}/${id} inconnue.` }))
              let user = req.user
              if (message.apiKey) user = await this.readApiKey(db, message.apiKey, type)
              if (!permissions.can(type, resource, `realtime-${subject}`, user)) {
                return ws.send(JSON.stringify({ type: 'error', status: 403, data: 'Permission manquante.' }))
              }
            }

            subscribers[message.channel] = subscribers[message.channel] || {}
            subscribers[message.channel][clientId] = 1
            return ws.send(JSON.stringify({ type: 'subscribe-confirm', channel: message.channel }))
          }
          if (message.type === 'unsubscribe') {
            subscribers[message.channel] = subscribers[message.channel] || {}
            delete subscribers[message.channel][clientId]
            return ws.send(JSON.stringify({ type: 'unsubscribe-confirm', channel: message.channel }))
          }
        } catch (err) {
          return ws.send(JSON.stringify({ type: 'error', data: err.message }))
        }
      })

      ws.on('close', () => {
        Object.keys(subscribers).forEach(channel => {
          delete subscribers[channel][clientId]
        })
        delete clients[clientId]
      })

      ws.on('error', () => ws.terminate())

      ws.isAlive = true
      ws.on('pong', () => { ws.isAlive = true })
    })
  })

  // standard ping/pong used to detect lost connections
  setInterval(function ping () {
    if (stopped) return
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate()

      ws.isAlive = false
      ws.ping('', false, () => {})
    })
  }, 30000)

  const mongoChannel = await channel(db)
  await mongoChannel.insertOne({ type: 'init' })
  initCursor(db, mongoChannel)
}

// Listen to pubsub channel based on mongodb to support scaling on multiple processes
let startDate = new Date().toISOString()
const initCursor = (db, mongoChannel) => {
  cursor = mongoChannel.find({}, { tailable: true, awaitData: true })
  cursor.forEach(doc => {
    if (stopped) return
    if (doc && doc.type === 'message') {
      if (doc.data.date && doc.data.date < startDate) return
      const subs = subscribers[doc.channel] || {}
      Object.keys(subs).forEach(sub => {
        if (clients[sub]) clients[sub].send(JSON.stringify(doc))
      })
    }
  }, async (err) => {
    if (stopped) return
    startDate = new Date().toISOString()
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('WS tailable cursor was interrupted, reinit it', err && err.message)
    initCursor(db, mongoChannel)
  })
}

exports.initPublisher = async (db) => {
  // Write to pubsub channel
  const mongoChannel = await channel(db)
  await mongoChannel.insertOne({ type: 'init' })
  return (channel, data) => mongoChannel.insertOne({ type: 'message', channel, data })
}
