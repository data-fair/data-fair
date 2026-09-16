import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

// datasets created before _owner/_ownerName became x-calculated persisted them as regular schema
// properties (possibly with a user-edited title, a concept, or a cardinality computed by finalize).
// extendedSchema keeps the stored definition when it is not calculated, so such a dataset would never
// pick up the new one — hence a wholesale rewrite rather than a simple flag.
const canonicalOwnerProp = (key: string) => {
  if (key === '_owner') {
    return {
      'x-calculated': true,
      key: '_owner',
      type: 'string',
      title: 'Propriétaire de la ligne',
      'x-capabilities': { insensitive: false, text: false, textStandard: false }
    }
  }
  if (key === '_ownerName') {
    return {
      'x-calculated': true,
      key: '_ownerName',
      type: 'string',
      title: 'Nom du propriétaire de la ligne',
      'x-capabilities': { text: false }
    }
  }
}

const upgradeScript: UpgradeScript = {
  description: 'Mark the line-ownership columns _owner/_ownerName as calculated in stored REST schemas',
  async exec (db, debug) {
    const datasets = db.collection('datasets')
    const filter = {
      isRest: true,
      'rest.lineOwnership': true,
      schema: { $elemMatch: { key: { $in: ['_owner', '_ownerName'] }, 'x-calculated': { $ne: true } } }
    }
    let count = 0
    for await (const dataset of datasets.find(filter).project({ _id: 1, schema: 1 })) {
      const schema = (dataset.schema as { key: string }[]).map(prop => canonicalOwnerProp(prop.key) ?? prop)
      await datasets.updateOne({ _id: dataset._id }, { $set: { schema } })
      count++
    }
    debug(`marked ownership columns as calculated on ${count} datasets`)
  }
}

export default upgradeScript
