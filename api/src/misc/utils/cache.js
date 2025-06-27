// Caches some data in mongodb
// Do not use this too much as elasticsearch is a performant backend already,
// only for specific cases like vector tiles
import mongo from '#mongo'
import config from '#config'
import objectHash from 'object-hash'
import debugLib from 'debug'

const debug = debugLib('cache')

export const init = async () => {
  const collection = (await mongo.db.listCollections({ name: 'cache' }).toArray())[0]
  if (!collection) await mongo.db.createCollection('cache', { capped: true, size: config.cache.mongoSize * 1000000 })
  return mongo.db.collection('cache')
}

export const get = async (params) => {
  const hash = objectHash(params)
  const result = await mongo.db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  debug('get ', hash, !!result)
  return { hash, value: result && result.value }
}

export const set = async (hash, value) => {
  debug('set ', hash, !!value)
  try {
    await mongo.db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
}

export const getSet = async (params, getter) => {
  const hash = objectHash(params)
  const result = await mongo.db.collection('cache').findOne({ _id: hash }, { readPreference: 'nearest' })
  if (result) {
    debug('getSet return from mongo cache', hash, !!result)
    return result.value
  }
  const value = await getter(params)
  debug('getSet used getter and set value in cache', hash)
  try {
    await mongo.db.collection('cache').insertOne({ value, _id: hash })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
  return value
}
