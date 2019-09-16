// TODO add ensureIndex instructions to init logic.
const debug = require('debug')('db')
const config = require('config')
const { MongoClient } = require('mongodb')

async function ensureIndex(db, collection, key, options) {
  try {
    await db.collection(collection).createIndex(key, options || {})
  } catch (error) {
    console.error('Init mongodb index creation failure for', collection, key, error)
  }
}

exports.connect = async () => {
  let client
  const opts = {
    useNewUrlParser: true,
    reconnectTries: Number.MAX_VALUE,
    // workers generate a lot of opened sockets if we do not change this setting
    poolSize: config.mode === 'task' ? 1 : 5
  }
  debug('Connecting to mongodb ' + config.mongoUrl)
  try {
    client = await MongoClient.connect(config.mongoUrl, opts)
  } catch (err) {
    // 1 retry after 1s
    // solve the quite common case in docker-compose of the service starting at the same time as the db
    await new Promise(resolve => setTimeout(resolve, 1000))
    client = await MongoClient.connect(config.mongoUrl, opts)
  }
  const db = client.db()
  return { db, client }
}

exports.init = async (db) => {
  const promises = [
    // datasets indexes
    ensureIndex(db, 'datasets', { id: 1 }, { unique: true }),
    ensureIndex(db, 'datasets', { 'owner.type': 1, 'owner.id': 1 }),
    ensureIndex(db, 'datasets', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    ensureIndex(db, 'datasets', { 'virtual.children': 1 }),
    // remote-services indexes
    ensureIndex(db, 'remote-services', { id: 1 }, { unique: true }),
    // ensureIndex(db, 'remote-services', { 'apiDoc.info.x-api-id': 1 }, { unique: true })
    ensureIndex(db, 'remote-services', { title: 'text', description: 'text' }, { name: 'fulltext' }),
    // base applications indexes
    ensureIndex(db, 'base-applications', { url: 1 }, { unique: true }),
    ensureIndex(db, 'base-applications', { id: 1 }, { unique: true }),
    ensureIndex(db, 'base-applications', { title: 'text', description: 'text', 'meta.title': 'text', 'meta.description': 'text', 'meta.application-name': 'text' }, { name: 'fulltext' }),
    // applications indexes
    ensureIndex(db, 'applications', { id: 1 }, { unique: true }),
    ensureIndex(db, 'applications', { 'owner.type': 1, 'owner.id': 1 }),
    ensureIndex(db, 'applications', { 'configuration.datasets.href': 1 }),
    ensureIndex(db, 'applications', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    // catalogs indexes
    ensureIndex(db, 'catalogs', { id: 1 }, { unique: true }),
    ensureIndex(db, 'catalogs', { 'owner.type': 1, 'owner.id': 1 }),
    ensureIndex(db, 'catalogs', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    // settings
    ensureIndex(db, 'settings', { type: 1, id: 1 }, { unique: true }),
    ensureIndex(db, 'settings', { 'apiKeys.key': 1 }, { sparse: true }),
    // quotas
    ensureIndex(db, 'quotas', { type: 1, id: 1 }, { unique: true }),
    ensureIndex(db, 'quotas', { name: 'text' }, { name: 'fulltext' }),
    // Sessions managed by express-session, but we add our custom indices
    ensureIndex(db, 'sessions', { 'session.activeApplications.id': 1 })
  ]
  await Promise.all(promises)
}
