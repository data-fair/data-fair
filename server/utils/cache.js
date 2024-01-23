// Caches some data in mongodb
// Do not use this too much as elasticsearch is a performant backend already,
// only for specific cases like vector tiles

const config = require('config')
const objectHash = require('object-hash')
const debug = require('debug')('cache')

exports.init = async (db) => {
  const collection = (await db.listCollections({ name: 'cache' }).toArray())[0]
  if (!collection) await db.createCollection('cache', { capped: true, size: config.cache.mongoSize * 1000000 })
  return db.collection('cache')
}

exports.get = async (db, params) => {
  const hash = objectHash(params)
  const result = await db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  debug('get ', hash, !!result)
  return { hash, value: result && result.value }
}

exports.set = async (db, hash, value) => {
  debug('set ', hash, !!value)
  try {
    await db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
}

const getSetPendingPromises = {}

exports.getSet = async (db, params, getter) => {
  const hash = objectHash(params)
  if (getSetPendingPromises[hash]) {
    debug('getSet return already pending promise', hash)
    return getSetPendingPromises[hash]
  }
  const result = await db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  if (result) {
    debug('getSet return from mongo cache', hash, !!result)
    return result.value
  }
  const promise = getSetPendingPromises[hash] = getter(params)
  promise.finally(() => delete getSetPendingPromises[hash])
  const value = await promise
  debug('getSet used getter and set value in cache', hash)
  try {
    await db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
  return value
}
