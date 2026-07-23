// Shared alert plumbing for the integrity bad-state events (round 3 §S3): entry-alert plus a
// periodic re-alert while the state persists (bounds the pre-written-dedup-state suppression),
// with the dedup date cleared on recovery so a future relapse alerts immediately. Kept out of
// checker.ts so the scope audit can use it without a checker↔audit import cycle.
import config from '#config'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import * as ops from './operations.ts'
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
  await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', eventKey)
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { [`integrity.alerts.${dedupKey}`]: new Date().toISOString() } })
  return true
}
