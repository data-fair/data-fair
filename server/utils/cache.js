// Caches some data in mongodb
// Do not use this too much as elasticsearch is a performant backend already,
// only for specific cases like vector tiles

const config = require('config')
const objectHash = require('object-hash')
const debug = require('debug')('cache')

exports.init = async(db) => {
  const collection = (await db.listCollections({ name: 'cache' }).toArray())[0]
  if (!collection) await db.createCollection('cache', { capped: true, size: config.cache.size * 1000000 })
  return db.collection('cache')
}

exports.get = async(db, params) => {
  const hash = objectHash(params)
  const result = await db.collection('cache').findOne({ _id: hash })
  debug('get ', hash, !!result)
  return { hash, value: result && result.value }
}

exports.set = async(db, hash, value) => {
  debug('set ', hash, !!value)
  try {
    await db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
}
