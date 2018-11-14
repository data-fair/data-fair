// TODO add ensureIndex instructions to init logic.

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
  try {
    client = await MongoClient.connect(config.mongoUrl)
  } catch (err) {
    // 1 retry after 1s
    // solve the quite common case in docker-compose of the service starting at the same time as the db
    await new Promise(resolve => setTimeout(resolve, 1000))
    client = await MongoClient.connect(config.mongoUrl)
  }
  const db = client.db()
  return { db, client }
}

exports.init = async () => {
  console.log('Connecting to mongodb ' + config.mongoUrl)
  const { db, client } = await exports.connect()
  // datasets indexes
  await ensureIndex(db, 'datasets', { id: 1 }, { unique: true })
  await ensureIndex(db, 'datasets', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'datasets', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  await ensureIndex(db, 'datasets', { 'virtual.children': 1 })
  // remote-services indexes
  await ensureIndex(db, 'remote-services', { id: 1 }, { unique: true })
  await ensureIndex(db, 'remote-services', { 'apiDoc.info.x-api-id': 1 }, { unique: true })
  await ensureIndex(db, 'remote-services', { title: 'text', description: 'text' }, { name: 'fulltext' })
  // base applications indexes
  await ensureIndex(db, 'base-applications', { url: 1 }, { unique: true })
  await ensureIndex(db, 'base-applications', { id: 1 }, { unique: true })
  await ensureIndex(db, 'base-applications', { title: 'text', description: 'text', 'meta.title': 'text', 'meta.description': 'text', 'meta.application-name': 'text' }, { name: 'fulltext' })
  // applications indexes
  await ensureIndex(db, 'applications', { id: 1 }, { unique: true })
  await ensureIndex(db, 'applications', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'applications', { 'configuration.datasets.href': 1 })
  await ensureIndex(db, 'applications', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  // catalogs indexes
  await ensureIndex(db, 'catalogs', { id: 1 }, { unique: true })
  await ensureIndex(db, 'catalogs', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'catalogs', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  // settings
  await ensureIndex(db, 'settings', { type: 1, id: 1 }, { unique: true })
  await ensureIndex(db, 'settings', { 'apiKeys.key': 1 }, { sparse: true })
  // quotas
  await ensureIndex(db, 'quotas', { type: 1, id: 1 }, { unique: true })
  await ensureIndex(db, 'quotas', { 'name': 'text' }, { name: 'fulltext' })
  // Sessions managed by express-session, but we add our custom indices
  await ensureIndex(db, 'sessions', { 'session.activeApplications': 1 })
  return { db, client }
}
