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
  const opts = { ...config.mongo.options }
  // workers generate a lot of opened sockets if we do not change this setting
  if (config.mode === 'task') opts.maxPoolSize = 1
  debug('Connecting to mongodb ' + config.mongo.url)
  try {
    client = await MongoClient.connect(config.mongo.url, opts)
  } catch (err) {
    // 1 retry after 1s
    // solve the quite common case in docker-compose of the service starting at the same time as the db
    await new Promise(resolve => setTimeout(resolve, 1000))
    client = await MongoClient.connect(config.mongo.url, opts)
  }
  const db = client.db()
  return { db, client }
}

exports.init = async (db) => {
  const promises = [
    // datasets indexes
    exports.ensureIndex(db, 'datasets', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'datasets', { _uniqueRefs: 1, 'owner.type': 1, 'owner.id': 1 }, { unique: true, name: 'unique-refs' }), // used to prevent conflicts accross ids and slugs
    // used to fetch list sorted by creation
    exports.ensureIndex(db, 'datasets', { 'owner.type': 1, 'owner.id': 1, createdAt: -1 }, { name: 'main-keys' }),
    // full text search
    exports.ensureIndex(db, 'datasets', { title: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text', keywords: 'text', 'topics.title': 'text' }, { name: 'fulltext', weights: { title: 2 } }),
    // special purpose indexes for workers, etc
    exports.ensureIndex(db, 'datasets', { 'virtual.children': 1 }),
    exports.ensureIndex(db, 'datasets', { publicationSites: 1 }),
    exports.ensureIndex(db, 'datasets', { 'rest.ttl.checkedAt': 1 }),
    exports.ensureIndex(db, 'datasets', { 'rest.ttl.active': 1 }),
    exports.ensureIndex(db, 'datasets', { 'remoteFile.autoUpdate.nextUpdate': 1 }),
    exports.ensureIndex(db, 'datasets', { '_readApiKey.renewAt': 1 }),

    // remote-services indexes
    exports.ensureIndex(db, 'remote-services', { id: 1 }, { unique: true }),
    // exports.ensureIndex(db, 'remote-services', { 'apiDoc.info.x-api-id': 1 }, { unique: true })
    exports.ensureIndex(db, 'remote-services', { title: 'text', description: 'text' }, { name: 'fulltext', weights: { title: 2 } }),
    exports.ensureIndex(db, 'remote-services', { 'virtualDatasets.active': 1 }, { name: 'virtualDatasets-active' }),
    exports.ensureIndex(db, 'remote-services', { 'virtualDatasets.parent.id': 1 }, { name: 'virtualDatasets-parent' }),
    exports.ensureIndex(db, 'remote-services', { 'standardSchema.active': 1 }, { name: 'standardSchema-active' }),

    // base applications indexes
    exports.ensureIndex(db, 'base-applications', { url: 1 }, { unique: true }),
    exports.ensureIndex(db, 'base-applications', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'base-applications', { title: 'text', description: 'text', 'meta.title': 'text', 'meta.description': 'text', 'meta.application-name': 'text' }, { name: 'fulltext', weights: { title: 2 } }),

    // applications indexes
    exports.ensureIndex(db, 'applications', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'applications', { _uniqueRefs: 1, 'owner.type': 1, 'owner.id': 1 }, { unique: true, name: 'unique-refs' }), // used to prevent conflicts accross ids and slugs
    // used to fetch list sorted by creation
    exports.ensureIndex(db, 'applications', { 'owner.type': 1, 'owner.id': 1, createdAt: -1 }, { name: 'main-keys' }),
    // full text search
    exports.ensureIndex(db, 'applications', { title: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text' }, { name: 'fulltext', weights: { title: 2 } }),
    // get the applications of a dataset
    exports.ensureIndex(db, 'applications', { 'configuration.datasets.href': 1 }),
    exports.ensureIndex(db, 'applications', { 'configuration.datasets.id': 1 }, { name: 'datasets-id', sparse: true }),
    exports.ensureIndex(db, 'applications', { 'configuration.applications.id': 1 }, { name: 'child-app-id', sparse: true }),

    // applications keys indexes
    exports.ensureIndex(db, 'applications-keys', { 'keys.id': 1 }),

    // catalogs indexes
    exports.ensureIndex(db, 'catalogs', { id: 1 }, { unique: true }),
    exports.ensureIndex(db, 'catalogs', { 'owner.type': 1, 'owner.id': 1 }),
    exports.ensureIndex(db, 'catalogs', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext', weights: { title: 2 } }),

    // settings
    exports.ensureIndex(db, 'settings', { type: 1, id: 1, department: 1 }, { unique: true, name: 'main-keys' }),
    exports.ensureIndex(db, 'settings', { 'apiKeys.key': 1 }, { sparse: true }),
    exports.ensureIndex(db, 'settings', { 'publicationSites.url': 1 }, { sparse: true }),

    // shared extensions cache with a 10 days expiration delay
    exports.ensureIndex(db, 'extensions-cache', { extensionKey: 1, input: 1 }, { name: 'main-keys' }),
    exports.ensureIndex(db, 'extensions-cache', { lastUsed: 1 }, { name: 'expiration', expireAfterSeconds: 60 * 60 * 24 * 10 }),
    // journals indexes
    exports.ensureIndex(db, 'journals', { type: 1, id: 1, 'owner.type': 1, 'owner.id': 1 }, { unique: true }),
    // thumbnails cache with a 10 days expiration delay
    exports.ensureIndex(db, 'thumbnails-cache', { url: 1, width: 1, height: 1, fit: 1, position: 1 }, { unique: true, name: 'main-keys' }),
    exports.ensureIndex(db, 'thumbnails-cache', { lastUpdated: 1 }, { name: 'expiration', expireAfterSeconds: 60 * 60 * 24 * 10 })
  ]
  await Promise.all(promises)
}
