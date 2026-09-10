// Shared alert plumbing for the integrity bad-state events (round 3 §S3): entry-alert plus a
// periodic re-alert while the state persists (bounds the pre-written-dedup-state suppression),
// with the dedup date cleared on recovery so a future relapse alerts immediately. Kept out of
// checker.ts so the scope audit can use it without a checker↔audit import cycle.
import config from '#config'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import * as ops from './operations.ts'
import { internalError } from '@data-fair/lib-node/observer.js'
import * as notifications from '../misc/utils/notifications.ts'

// `dedupKey` defaults to the event key; pass a distinct one when two sources share an event
// (dataset-level vs lines renewal) so one recovering does not clear the other's cadence.
export const maybeAlert = async (dataset: DatasetInternal, eventKey: string, isBad: boolean, dedupKey = eventKey): Promise<boolean> => {
  const alerts: Record<string, string> = dataset.integrity?.alerts ?? {}
  if (!isBad) {
    if (alerts[dedupKey]) await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { [`integrity.alerts.${dedupKey}`]: '' } })
    return false
  }
  const realertDays = config.integrity?.realertDays ?? 7
  if (!ops.shouldNotify(true, alerts[dedupKey], realertDays, Date.now())) return false
  // Operator channel, independent of any subscription. The notification below only reaches
  // someone who subscribed to THIS dataset's topic (by slug), so on its own the guarantee is
  // only as strong as the odds that somebody did — and nobody can subscribe to a dataset
  // enrolled after they last looked. internalError increments df_internal_error{errorCode},
  // the counter deployments already alert on, and logs a line with the same code.
  // FIRST, deliberately: the operator signal must not be contingent on the events service being
  // reachable. Same cadence as the notification (entry, then once per realertDays) because it
  // sits past the dedup gate above.
  internalError(eventKey, new Error(`${eventKey} on dataset ${dataset.id} (${dataset.slug ?? 'no slug'}), owner ${dataset.owner?.type}/${dataset.owner?.id}`))
  // forcePrivate: these say the dataset's protection is in a bad state, not what it contains.
  // The default visibility follows the dataset, so on a public one "was tampered with" would be
  // broadcast to anyone subscribed — an integrity failure is for the people who can act on it.
  await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', eventKey, { forcePrivate: true })
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { [`integrity.alerts.${dedupKey}`]: new Date().toISOString() } })
  return true
}
