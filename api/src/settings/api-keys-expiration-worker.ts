import cron, { type ScheduledTask } from 'node-cron'
import dayjs from 'dayjs'
import i18n from 'i18n'
import Debug from 'debug'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import config from '#config'
import mongo from '#mongo'
import { sendMail, type MailRecipient } from '../misc/utils/mails.ts'
import { type Milestone, milestoneFlag, computeDueMilestones } from './api-keys-expiration-milestones.ts'

const debug = Debug('api-keys-expiration')

let stopped = false
let taskPromise: Promise<void> | undefined
let scheduledTask: ScheduledTask | undefined

// settings docs store type/id/department at the root
const buildRecipients = (settingsDoc: any): MailRecipient[] => {
  if (settingsDoc.type === 'user') return [{ type: 'user', id: settingsDoc.id }]
  const base = { type: 'organization' as const, id: settingsDoc.id, role: 'admin' }
  if (settingsDoc.department) {
    // department admins + root org admins (disjoint sets)
    return [{ ...base, department: settingsDoc.department }, { ...base }]
  }
  return [base]
}

const renderMail = (milestone: Milestone, apiKey: { title: string, expireAt: string }, to: MailRecipient[]) => {
  const locale = config.i18n.defaultLocale
  const params = { title: apiKey.title, expireAt: apiKey.expireAt }
  const subject = i18n.__({ phrase: `mails.api-key.${milestone}.subject`, locale }, params)
  const text = i18n.__({ phrase: `mails.api-key.${milestone}.text`, locale }, params)
  return { to, subject, text, html: `<p>${text}</p>` }
}

const tryEmit = async (
  settingsDoc: any,
  apiKey: { id: string, title: string, expireAt: string },
  milestone: Milestone
) => {
  const flag = milestoneFlag[milestone]
  // send first: a failed mail must not flag the key as notified (it retries next run).
  // The task-level lock guarantees a single pod runs at a time, so sending before the
  // flag is set cannot duplicate mails; the arrayFilter guard below keeps idempotency
  // across runs/retries.
  const sent = await sendMail(renderMail(milestone, apiKey, buildRecipients(settingsDoc)))
  if (!sent) return
  await mongo.settings.updateOne(
    { _id: settingsDoc._id },
    { $set: { [`apiKeys.$[k].${flag}`]: new Date().toISOString() } },
    { arrayFilters: [{ 'k.id': apiKey.id, [`k.${flag}`]: { $exists: false } }] }
  )
}

const runOnce = async () => {
  const now = dayjs().format('YYYY-MM-DD')
  const j3 = dayjs().add(3, 'day').format('YYYY-MM-DD')
  // cheap pre-filter; computeDueMilestones is the authoritative decision.
  // Lower bound `>= now` skips keys that expired in the past — we never notify those
  // anymore, so there is no point scanning them on every run.
  const cursor = mongo.settings.find({
    apiKeys: {
      $elemMatch: {
        expireAt: { $exists: true, $gte: now, $lte: j3 },
        $or: [{ notifiedJ3At: { $exists: false } }, { notifiedJAt: { $exists: false } }]
      }
    }
  })
  for await (const settingsDoc of cursor) {
    for (const apiKey of (settingsDoc as any).apiKeys ?? []) {
      if (!apiKey.id || !apiKey.expireAt) continue
      for (const milestone of computeDueMilestones(apiKey, now)) {
        await tryEmit(settingsDoc, apiKey, milestone)
      }
    }
  }
}

export const task = async () => {
  if (stopped) return
  try {
    debug('run api-keys expiration cron task')
    const ack = await locks.acquire('api-keys-expiration-task')
    if (!ack) {
      debug('another pod holds the api-keys-expiration lock, skipping this run')
      return
    }
    try {
      await runOnce()
    } finally {
      await locks.release('api-keys-expiration-task')
    }
    debug('api-keys expiration cron task done')
  } catch (err) {
    internalError('api-keys-expiration-cron', err)
  }
}

export const start = () => {
  scheduledTask = cron.schedule(config.apiKeysExpirationCron, () => {
    if (taskPromise) {
      console.warn('api-keys-expiration task already running')
      return
    }
    taskPromise = task()
    taskPromise.finally(() => { taskPromise = undefined })
  })
}

export const stop = async () => {
  stopped = true
  scheduledTask?.stop()
  if (taskPromise) await taskPromise
}
