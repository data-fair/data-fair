import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Backfill _modified field on datasets and create indexes for sorting',
  async exec (db, debug) {
    // Idempotent: only touches docs missing _modified. New docs get the field
    // at write-time via computeModified() in service.js / rest.ts.
    debug('backfilling _modified on datasets without it')
    const result = await db.collection('datasets').updateMany(
      { _modified: { $exists: false } },
      [{
        $set: {
          _modified: {
            $cond: [
              { $eq: [{ $type: '$modified' }, 'string'] },
              {
                $cond: [
                  { $gt: [{ $strLenCP: '$modified' }, 0] },
                  {
                    $cond: [
                      { $eq: [{ $strLenCP: '$modified' }, 10] },
                      { $concat: ['$modified', 'T00:00:00.000Z'] },
                      '$modified'
                    ]
                  },
                  { $ifNull: ['$dataUpdatedAt', '$updatedAt'] }
                ]
              },
              { $ifNull: ['$dataUpdatedAt', '$updatedAt'] }
            ]
          }
        }
      }]
    )
    debug(`backfilled ${result.modifiedCount} datasets`)

    // createIndex is a no-op when an index with the same spec and name exists.
    debug('ensuring { _modified: -1 } index')
    await db.collection('datasets').createIndex({ _modified: -1 }, { name: '_modified_-1' })

    debug('ensuring owner-scoped { owner.type, owner.id, _modified: -1 } index')
    await db.collection('datasets').createIndex(
      { 'owner.type': 1, 'owner.id': 1, _modified: -1 },
      { name: 'owner_modified' }
    )
  }
}

export default upgradeScript
