import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import { removeWebhookEvents } from '../../src/settings/operations.ts'

// These two webhook event types were never emitted and were dropped from the settings schema's
// closed `oneOf`. Settings still listing them fail validation on every later write of the whole
// document — including the publication-site upsert/delete routes driven by the portals sync.
const removed = ['dataset-publication', 'application-publication']

const upgradeScript: UpgradeScript = {
  description: 'Remove the never-emitted publication event types from settings webhooks',
  async exec (db, debug) {
    let cleaned = 0
    // idempotent: once cleaned, a document no longer matches the filter
    for await (const settings of db.collection('settings').find({ 'webhooks.events': { $in: removed } }, { projection: { webhooks: 1 } })) {
      const webhooks = removeWebhookEvents(settings.webhooks, removed)
      if (!webhooks) continue
      await db.collection('settings').updateOne({ _id: settings._id }, { $set: { webhooks } })
      cleaned++
    }
    debug(`removed publication webhook events from ${cleaned} settings`)
  }
}

export default upgradeScript
