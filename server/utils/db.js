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
  const db = await mongoClient.connect(config.mongoUrl, {autoReconnect: true, bufferMaxEntries: -1})
  // datasets indexes
  await ensureIndex(db, 'datasets', {id: 1}, {unique: true})
  await ensureIndex(db, 'datasets', {title: 'text', description: 'text'}, {name: 'fulltext'})
  // external-apis indexes
  await ensureIndex(db, 'external-apis', {id: 1}, {unique: true})
  await ensureIndex(db, 'external-apis', {title: 'text', description: 'text'}, {name: 'fulltext'})
  return db
}
