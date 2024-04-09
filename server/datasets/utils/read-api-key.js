const { nanoid } = require('nanoid')
const dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
dayjs.extend(duration)

const makeKey = (owner) => {
  const parts = [owner.type.slice(0, 1), owner.id]
  if (owner.department) parts.push(owner.department)
  parts.push(nanoid())
  return Buffer.from(parts.join(':')).toString('base64url')
}

exports.create = (owner, readApiKey) => {
  if (!readApiKey.active) return null
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner)
  }
}

exports.update = (owner, readApiKey, _readApiKey) => {
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner),
    previous: _readApiKey.current
  }
}
