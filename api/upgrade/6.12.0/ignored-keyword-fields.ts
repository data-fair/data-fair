import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import es from '../../src/es.ts'
import { getIgnoredKeywordFields } from '../../src/datasets/es/manage-indices.ts'

const upgradeScript: UpgradeScript = {
  description: 'Backfill _esIgnoredKeywordFields on existing datasets from the ES _ignored metadata field',
  async exec (db, debug) {
    await es.connect() // ES client is not yet connected at upgrade time (runs before es.init())
    const cursor = db.collection('datasets').find({
      isVirtual: { $ne: true },
      isMetaOnly: { $ne: true },
      status: 'finalized',
      _esIgnoredKeywordFields: { $exists: false } // idempotent: skip already-backfilled datasets
    })
    let processed = 0
    let flaggedCount = 0
    for await (const dataset of cursor) {
      try {
        const fields = await getIgnoredKeywordFields(dataset)
        await db.collection('datasets').updateOne(
          { _id: dataset._id },
          { $set: { _esIgnoredKeywordFields: fields } } // [] marks the dataset processed AND is the correct routing value
        )
        processed++
        if (fields.length) { flaggedCount++; debug(`flagged ${dataset.id}: ${fields.join(', ')}`) }
      } catch (err: any) {
        debug(`skipped ${dataset.id}: ${err.message}`)
      }
    }
    debug(`backfilled ${processed} datasets (${flaggedCount} with truncated columns)`)
  }
}

export default upgradeScript
