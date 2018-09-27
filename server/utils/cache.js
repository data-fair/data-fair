// Caches some data in mongodb
// Do not use this too mush as elasticsearch is a performant backend already,
// only for specific cases, vector tiles

const config = require('config')
const objectHash = require('object-hash')

exports.init = async(db) => {
  await db.createCollection('cache', { capped: true, size: config.cache.size * 1000000 })
}

exports.get = async(db, params) => {
  const hash = objectHash(params)
  const result = await db.collection('cache').findOne({ _id: hash })
  return { hash, value: result && result.value }
}

exports.set = async(db, hash, value) => {
  await db.collection('cache').insert({ value, _id: hash })
}
