import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration.js'
import type { Account } from '@data-fair/lib-express'
dayjs.extend(duration)

type ReadApiKey = {
  active?: boolean
  interval: string
  expiresAt?: string
  renewAt?: string
}

type ReadApiKeyResult = {
  current: string
  previous?: string
}

const makeKey = (owner: Account): string => {
  const parts = [owner.type.slice(0, 1), owner.id]
  if (owner.department) parts.push(owner.department)
  parts.push(nanoid())
  return Buffer.from(parts.join(':')).toString('base64url')
}

export const create = (owner: Account, readApiKey: ReadApiKey): ReadApiKeyResult | null => {
  if (!readApiKey.active) return null
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner)
  }
}

export const update = (owner: Account, readApiKey: ReadApiKey, _readApiKey: ReadApiKeyResult): ReadApiKeyResult => {
  const d = dayjs.duration(readApiKey.interval).asSeconds()
  readApiKey.expiresAt = dayjs().add(d, 's').toISOString()
  readApiKey.renewAt = dayjs().add(d / 2, 's').toISOString()
  return {
    current: makeKey(owner),
    previous: _readApiKey.current
  }
}
