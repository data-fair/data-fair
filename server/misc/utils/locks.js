
import { hostname } from 'node:os'
import { nanoid } from 'nanoid'
import config from 'config'
import debugLib from 'debug'

const debug = debugLib('locks')
const pid = nanoid()

debug('locks with pid', pid)

let interval
export const init = async db => {
  const locks = db.collection('locks')
  await locks.createIndex({ pid: 1 })
  try {
    await locks.createIndex({ updatedAt: 1 }, { expireAfterSeconds: config.locks.ttl })
  } catch (err) {
    console.log('Failure to create TTL index. Probably because the value changed. Try to update it.')
    db.command({ collMod: 'locks', index: { keyPattern: { updatedAt: 1 }, expireAfterSeconds: config.locks.ttl } })
  }

  // prolongate lock acquired by this process while it is still active
  interval = setInterval(() => {
    locks.updateMany({ pid }, { $currentDate: { updatedAt: true } })
  }, (config.locks.ttl / 2) * 1000)
}

export const stop = async (db) => {
  clearInterval(interval)
  await db.collection('locks').deleteMany({ pid })
}

export const acquire = async (db, _id, origin) => {
  debug('acquire', _id, origin)
  const locks = db.collection('locks')
  try {
    await locks.insertOne({ _id, pid, origin, hostname: hostname(), createdAt: new Date() })
    try {
      await locks.updateOne({ _id }, { $currentDate: { updatedAt: true } })
    } catch (err) {
      await locks.deleteOne({ _id, pid })
      throw err
    }
    debug('acquire ok', _id)
    return true
  } catch (err) {
    if (err.code !== 11000) throw err
    // duplicate means the lock was already acquired
    debug('acquire ko', _id)
    return false
  }
}

export const release = async (db, _id, delay = 0) => {
  debug('release', _id)
  if (delay) {
    const date = new Date((new Date()).getTime() + delay)
    await db.collection('locks').updateOne({ _id, pid }, { $unset: { pid: 1 }, $set: { delayed: true, updatedAt: date } })
  } else {
    await db.collection('locks').deleteOne({ _id, pid })
  }
}
