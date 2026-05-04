import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Backfill _modified field on existing datasets',
  async exec (db, debug) {
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
  }
}

export default upgradeScript
