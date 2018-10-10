// TODO add ensureIndex instructions to init logic.

const config = require('config')
const mongoClient = require('mongodb').MongoClient

async function ensureIndex(db, collection, key, options) {
  try {
    await db.collection(collection).createIndex(key, options || {})
  } catch (error) {
    console.error('Init mongodb index creation failure for', collection, key, error)
  }
}

exports.init = async () => {
  console.log('Connecting to mongodb ' + config.mongoUrl)
  let client
  try {
    client = await mongoClient.connect(config.mongoUrl)
  } catch (err) {
    // 1 retry after 1s
    // solve the quite common case in docker-compose of the service starting at the same time as the db
    await new Promise(resolve => setTimeout(resolve, 1000))
    client = await mongoClient.connect(config.mongoUrl)
  }
  const db = client.db()
  // datasets indexes
  await ensureIndex(db, 'datasets', { id: 1 }, { unique: true })
  await ensureIndex(db, 'datasets', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'datasets', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  // remote-services indexes
  await ensureIndex(db, 'remote-services', { id: 1 }, { unique: true })
  await ensureIndex(db, 'remote-services', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'remote-services', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  // base applications indexes
  await ensureIndex(db, 'base-applications', { url: 1 }, { unique: true })
  await ensureIndex(db, 'base-applications', { id: 1 }, { unique: true })
  // applications indexes
  await ensureIndex(db, 'applications', { id: 1 }, { unique: true })
  await ensureIndex(db, 'applications', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'applications', { 'configuration.datasets.href': 1 })
  await ensureIndex(db, 'applications', { 'configuration.remoteServices.href': 1 })
  await ensureIndex(db, 'applications', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })
  // catalogs indexes
  await ensureIndex(db, 'catalogs', { id: 1 }, { unique: true })
  await ensureIndex(db, 'catalogs', { 'owner.type': 1, 'owner.id': 1 })
  await ensureIndex(db, 'catalogs', { title: 'text', description: 'text', 'owner.name': 'text' }, { name: 'fulltext' })

  return { db, client }
}
