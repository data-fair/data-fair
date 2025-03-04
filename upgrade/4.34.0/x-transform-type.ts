import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Replace the deprecated ignoreDetection setting with x-transform',
  async exec (db, debug) {
    for await (const dataset of db.collection('datasets').find({
      $or: [
        { 'schema.ignoreDetection': { $exists: true } },
        { 'schema.ignoreIntegerDetection': { $exists: true } }
      ]
    })) {
      debug(`update dataset ${dataset.slug} (${dataset.id})`)
      for (const property of dataset.schema) {
        if (property.ignoreDetection) {
          debug(`remove ignoreDetection from property ${property.key}`)
          property['x-transform'] = property['x-transform'] || {}
          property['x-transform'].type = 'string'
          delete property.ignoreDetection
        }
        if (property.ignoreIntegerDetection) {
          debug(`remove ignoreIntegerDetection from property ${property.key}`)
          property['x-transform'] = property['x-transform'] || {}
          property['x-transform'].type = 'number'
          delete property.ignoreIntegerDetection
        }
      }
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { schema: dataset.schema } })
    }
  }
}

export default upgradeScript
