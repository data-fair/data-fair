const debug = require('debug')('db')
const config = require('config')
const { MongoClient } = require('mongodb')

exports.ensureIndex = async (db, collection, key, options = {}) => {
  try {
    await db.collection(collection).createIndex(key, options)
  } catch (err) {
    if ((err.code !== 85 && err.code !== 86) || !options.name) throw err

    // if the error is a conflict on keys or params of the index we automatically
    // delete then recreate the index
    console.log(`Drop then recreate index ${collection}/${options.name}`)
    await db.collection(collection).dropIndex(options.name)
    await db.collection(collection).createIndex(key, options)
  }
}

exports.connect = async () => {
  let client
  const opts = {
    useNewUrlParser: true,
    reconnectTries: Number.MAX_VALUE,
    // workers generate a lot of opened sockets if we do not change this setting
    poolSize: config.mode === 'task' ? 1 : 5,
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
    exports.ensureIndex(db, 'datasets', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'datasets', { 'owner.type': 1, 'owner.id': 1 }),
    exports.ensureIndex(db, 'datasets', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    exports.ensureIndex(db, 'datasets', { 'virtual.children': 1 }),
    exports.ensureIndex(db, 'datasets', { 'rest.ttl.checkedAt': 1 }),
    // remote-services indexes
    exports.ensureIndex(db, 'remote-services', { id: 1 }, { unique: true }),
    // exports.ensureIndex(db, 'remote-services', { 'apiDoc.info.x-api-id': 1 }, { unique: true })
    exports.ensureIndex(db, 'remote-services', { title: 'text', description: 'text' }, { name: 'fulltext' }),
    // base applications indexes
    exports.ensureIndex(db, 'base-applications', { url: 1 }, { unique: true }),
    exports.ensureIndex(db, 'base-applications', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'base-applications', { title: 'text', description: 'text', 'meta.title': 'text', 'meta.description': 'text', 'meta.application-name': 'text' }, { name: 'fulltext' }),
    // applications indexes
    exports.ensureIndex(db, 'applications', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'applications', { 'owner.type': 1, 'owner.id': 1 }),
    exports.ensureIndex(db, 'applications', { 'configuration.datasets.href': 1 }),
    exports.ensureIndex(db, 'applications', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    // applications keys indexes
    exports.ensureIndex(db, 'applications-keys', { 'keys.id': 1 }),
    // catalogs indexes
    exports.ensureIndex(db, 'catalogs', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'catalogs', { 'owner.type': 1, 'owner.id': 1 }),
    exports.ensureIndex(db, 'catalogs', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' }),
    // settings
    exports.ensureIndex(db, 'settings', { type: 1, id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'settings', { 'apiKeys.key': 1 }, { sparse: true }),
    // Sessions managed by express-session, but we add our custom indices
    exports.ensureIndex(db, 'sessions', { 'session.activeApplications.id': 1 }),
  ]
  await Promise.all(promises)
}
