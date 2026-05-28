import cron from 'node-cron'
import dayjs from 'dayjs'
import i18n from 'i18n'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import config from '#config'
import mongo from '#mongo'
import * as notifications from '../misc/utils/notifications.ts'

let stopped = false
let taskPromise: Promise<void> | undefined

type Milestone = 'expiring' | 'expired'
type FlagField = 'notifiedJ3At' | 'notifiedJAt'

const milestoneFlag: Record<Milestone, FlagField> = {
  expiring: 'notifiedJ3At',
  expired: 'notifiedJAt'
}

const renderTitleBody = (milestone: Milestone, apiKey: { title: string; expireAt: string }) => {
  const params = { title: apiKey.title, expireAt: apiKey.expireAt }
  const titleKey = `notifications.api-key.${milestone}.title`
  const bodyKey = `notifications.api-key.${milestone}.body`
  return {
    title: {
      fr: i18n.__({ phrase: titleKey, locale: 'fr' }, params),
      en: i18n.__({ phrase: titleKey, locale: 'en' }, params)
    },
    body: {
      fr: i18n.__({ phrase: bodyKey, locale: 'fr' }, params),
      en: i18n.__({ phrase: bodyKey, locale: 'en' }, params)
    }
  }
}

const tryEmit = async (
  settingsDoc: any,
  apiKey: { id: string; title: string; expireAt: string },
  milestone: Milestone
) => {
  const flag = milestoneFlag[milestone]
  // Atomic conditional set — wins exactly one race across all data-fair pods.
  const res = await mongo.settings.updateOne(
    { _id: settingsDoc._id },
    { $set: { [`apiKeys.$[k].${flag}`]: new Date().toISOString() } },
    {
      arrayFilters: [{
        'k.id': apiKey.id,
        [`k.${flag}`]: { $exists: false }
      }]
    }
  )
  if (res.modifiedCount !== 1) return // someone else already emitted

  // settings docs store type/id/department at root, not under an `owner` object
  const sender = {
    type: settingsDoc.type,
    id: settingsDoc.id,
    ...(settingsDoc.department ? { department: settingsDoc.department } : {})
  }

  const { title, body } = renderTitleBody(milestone, apiKey)
  await notifications.send({
    sender,
    originator: { internalProcess: { id: 'data-fair-worker' } },
    topic: { key: `data-fair:api-key-expiration:${apiKey.id}:${milestone}` },
    title,
    body,
    urlParams: { id: apiKey.id }
  } as any)
}

const runOnce = async () => {
  const today = dayjs().format('YYYY-MM-DD')
  const j3Threshold = dayjs().add(3, 'day').format('YYYY-MM-DD')

  const cursor = mongo.settings.find({
    apiKeys: {
      $elemMatch: {
        expireAt: { $exists: true, $lte: j3Threshold },
        $or: [
          { notifiedJ3At: { $exists: false } },
          { notifiedJAt: { $exists: false } }
        ]
      }
    }
  })

  for await (const settingsDoc of cursor) {
    for (const apiKey of (settingsDoc as any).apiKeys ?? []) {
      if (!apiKey.id || !apiKey.expireAt) continue
      if (apiKey.expireAt <= j3Threshold && !apiKey.notifiedJ3At) {
        await tryEmit(settingsDoc, apiKey, 'expiring')
      }
      // strict <: auth (api-key.ts) treats the day of expireAt as still valid,
      // so we only announce "expired" the day after.
      if (apiKey.expireAt < today && !apiKey.notifiedJAt) {
        await tryEmit(settingsDoc, apiKey, 'expired')
      }
    }
  }
}

export const task = async () => {
  if (stopped) return
  try {
    console.info('run api-keys expiration cron task')
    await locks.acquire('api-keys-expiration-task')
    await runOnce()
    await locks.release('api-keys-expiration-task')
    console.info('api-keys expiration cron task done')
  } catch (err) {
    internalError('api-keys-expiration-cron', err)
  }
}

export const start = () => {
  cron.schedule(config.apiKeysExpirationCron, async () => {
    if (taskPromise) {
      console.warn('api-keys-expiration task already running')
      return
    }
    taskPromise = task()
    taskPromise.then(() => { taskPromise = undefined })
  })
}

export const stop = async () => {
  stopped = true
  if (taskPromise) await taskPromise
}
