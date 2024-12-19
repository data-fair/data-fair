
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration.js'
dayjs.extend(duration)

const makeKey = (owner) => {
  const parts = [owner.type.slice(0, 1), owner.id]
  if (owner.department) parts.push(owner.department)
  parts.push(nanoid())
  return Buffer.from(parts.join(':')).toString('base64url')
}

export const create = (owner, readApiKey) => {
  if (!readApiKey.active) return null
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner)
  }
}

export const update = (owner, readApiKey, _readApiKey) => {
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner),
    previous: _readApiKey.current
  }
}
