import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const computeModified = (dataset: { modified?: string, dataUpdatedAt?: string, updatedAt?: string }): string | undefined => {
  if (dataset.modified) return new Date(dataset.modified).toISOString()
  if (dataset.dataUpdatedAt) return dataset.dataUpdatedAt
  if (dataset.updatedAt) return dataset.updatedAt
  return undefined
}

const upgradeScript: UpgradeScript = {
  description: 'Backfill _modified field on existing datasets',
  async exec (db, debug) {
    debug('backfilling _modified on datasets without it')
    let count = 0
    const cursor = db.collection('datasets').find({ _modified: { $exists: false } })
    for await (const dataset of cursor) {
      const _modified = computeModified(dataset as any)
      if (_modified) {
        await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { _modified } })
        count++
      }
    }
    debug(`backfilled ${count} datasets`)
  }
}

export default upgradeScript
