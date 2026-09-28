import assert from 'node:assert/strict'
import { collectNotifications } from './workers.ts'

export type CapturedNotif = {
  _id: string
  topic: { key: string }
  title: { fr: string, en: string }
  body: { fr: string, en: string }
  [k: string]: any
}

export type NotifCollector = {
  getAll: () => Promise<CapturedNotif[]>
  /**
   * Wait until at least `count` notifications matching `keyPrefix` (or all if no prefix)
   * have been observed, then return every notification captured so far.
   * Default 5 s timeout — long enough for worker-thread emissions to make the round-trip
   * through `parentPort.postMessage` + the main-thread listener in `api/src/workers/tasks.ts`.
   */
  waitFor: (count: number, opts?: { keyPrefix?: string, timeout?: number }) => Promise<CapturedNotif[]>
  /**
   * Quiescence helper — returns all notifications captured up to a short settling delay.
   * Use when asserting the *absence* of a notification (cannot `waitFor` something that never comes).
   */
  drain: (settleMs?: number) => Promise<CapturedNotif[]>
}

/**
 * Open a notification collector backed by the test-env buffer (offset-based, race-free).
 * Always go through this rather than the SSE-based TestEventClient for notification
 * assertions — the buffer is captured synchronously by `notifications.send` and never
 * misses an emission, whereas the SSE subscription has a window between collector
 * setup and the action under test.
 */
export const collectNotifs = async (): Promise<NotifCollector> => {
  const inner = await collectNotifications()
  return {
    getAll: () => inner.getAll(),
    waitFor: async (count, { keyPrefix, timeout = 5000 } = {}) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const all = await inner.getAll()
        const matching = keyPrefix ? all.filter(n => n.topic?.key?.startsWith(keyPrefix)) : all
        if (matching.length >= count) return all
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return inner.getAll()
    },
    drain: async (settleMs = 500) => {
      await new Promise(resolve => setTimeout(resolve, settleMs))
      return inner.getAll()
    }
  }
}

const summarize = (notifs: CapturedNotif[]) =>
  notifs.map(n => n.topic?.key).join(', ') || '(none)'

/**
 * Assert that exactly one notification with the given canonical topic key was captured.
 * Returns it for further assertions (body, params, …).
 */
export const expectNotif = (
  notifs: CapturedNotif[],
  topicKey: string,
  ctx = ''
): CapturedNotif => {
  const matches = notifs.filter(n => n.topic?.key === topicKey)
  const prefix = ctx ? `[${ctx}] ` : ''
  assert.ok(matches.length > 0, `${prefix}expected notif on ${topicKey}, got: ${summarize(notifs)}`)
  assert.equal(matches.length, 1, `${prefix}expected exactly 1 notif on ${topicKey}, got ${matches.length}`)
  return matches[0]
}

/**
 * Assert that NO notification matches the given topic key.
 */
export const expectNoNotif = (
  notifs: CapturedNotif[],
  topicKey: string,
  ctx = ''
) => {
  const found = notifs.find(n => n.topic?.key === topicKey)
  const prefix = ctx ? `[${ctx}] ` : ''
  assert.equal(found, undefined, `${prefix}expected NO notif on ${topicKey}, got: ${summarize(notifs)}`)
}

/**
 * Assert the dual slug+id emission produced by `sendResourceEvent` (see notifications.md §12):
 * one event on `<baseKey>:<id>`, one on `<baseKey>:<slug>`, both sharing the same `_id`.
 * Returns { id, slug } for further assertions.
 */
export const expectNotifPair = (
  notifs: CapturedNotif[],
  baseKey: string,
  resource: { id: string, slug?: string },
  ctx = ''
): { id: CapturedNotif, slug: CapturedNotif } => {
  const prefix = ctx ? `[${ctx}] ` : ''
  const id = expectNotif(notifs, `${baseKey}:${resource.id}`, ctx)
  if (!resource.slug || resource.slug === resource.id) {
    return { id, slug: id }
  }
  const slug = expectNotif(notifs, `${baseKey}:${resource.slug}`, ctx)
  assert.equal(slug._id, id._id, `${prefix}slug and id notifs must share _id (got ${slug._id} vs ${id._id})`)
  return { id, slug }
}
