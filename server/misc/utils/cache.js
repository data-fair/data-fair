// Caches some data in mongodb
// Do not use this too much as elasticsearch is a performant backend already,
// only for specific cases like vector tiles
import config from 'config'
import objectHash from 'object-hash'
import debugLib from 'debug'

export const init = async (db) => {
  const collection = (await db.listCollections({ name: 'cache' }).toArray())[0]
  if (!collection) await db.createCollection('cache', { capped: true, size: config.cache.mongoSize * 1000000 })
  return db.collection('cache')
}

export const get = async (db, params) => {
  const hash = objectHash(params)
  const result = await db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  debug('get ', hash, !!result)
  return { hash, value: result && result.value }
}

export const set = async (db, hash, value) => {
  debug('set ', hash, !!value)
  try {
    await db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
}

export const getSet = async (db, params, getter) => {
  const hash = objectHash(params)
  const result = await db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  if (result) {
    debug('getSet return from mongo cache', hash, !!result)
    return result.value
  }
  const value = await getter(params)
  debug('getSet used getter and set value in cache', hash)
  try {
    await db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
  return value
}
