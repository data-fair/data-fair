import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import { computeSearchText, type CatalogSearchSettings } from '../../src/datasets/operations.ts'

const upgradeScript: UpgradeScript = {
  description: 'Stamp the schema-derived _searchText on existing datasets',
  async exec (db, debug) {
    const settingsByOwner = new Map<string, CatalogSearchSettings | undefined>()
    const catalogSearchOf = async (owner: { type: string, id: string }) => {
      const key = `${owner.type}:${owner.id}`
      if (!settingsByOwner.has(key)) {
        const settings = await db.collection('settings').findOne(
          { type: owner.type, id: owner.id, department: { $exists: false } },
          { projection: { catalogSearch: 1 } }
        )
        settingsByOwner.set(key, settings?.catalogSearch)
      }
      return settingsByOwner.get(key)
    }

    let stamped = 0
    // idempotent: datasets already carrying the field are skipped; re-runs only fill gaps
    const cursor = db.collection('datasets').find(
      { _searchText: { $exists: false }, draftReason: { $exists: false }, 'schema.0': { $exists: true } },
      { projection: { id: 1, owner: 1, schema: 1, permissions: 1 } }
    )
    for await (const dataset of cursor) {
      const _searchText = computeSearchText(dataset as any, await catalogSearchOf(dataset.owner))
      if (!_searchText) continue
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { _searchText } })
      stamped++
    }
    debug(`stamped _searchText on ${stamped} datasets`)
  }
}

export default upgradeScript
