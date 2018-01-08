const shortid = require('shortid')
const config = require('config')
const pid = shortid.generate()

let interval
exports.init = async db => {
  const locks = db.collection('locks')
  await locks.createIndex({pid: 1})
  await locks.createIndex({updatedAt: 1}, {expireAfterSeconds: config.locks.ttl})

  // prolongate lock acquired by this process while it is still active
  interval = setInterval(() => {
    locks.update({pid}, {'$currentDate': {updatedAt: true}})
  }, (config.locks.ttl / 2) * 1000)
}

exports.stop = () => {
  clearInterval(interval)
}

exports.acquire = async (db, _id) => {
  const locks = db.collection('locks')
  try {
    await locks.insert({_id, pid})
    await locks.update({_id}, {'$currentDate': {updatedAt: true}})
    return true
  } catch (err) {
    if (err.code !== 11000) throw err
    // duplicate means the lock was already acquired
    return false
  }
}

exports.release = async (db, _id) => {
  const locks = db.collection('locks')
  await locks.remove({_id, pid})
}
