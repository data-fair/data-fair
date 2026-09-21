import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import type { AnyBulkWriteOperation } from 'mongodb'
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
    // idempotent: the `_searchText: {$exists: false}` filter means datasets already carrying the
    // field are skipped, so a re-run (or a run interrupted mid-way) only fills the remaining gaps.
    // No draftReason filter: a stored dataset document never carries a top-level `draftReason` (it
    // only ever lives at `draft.draftReason`), so that clause would match every document and do
    // nothing — `'schema.0': {$exists: true}` already excludes file-new drafts, whose top-level
    // schema is `[]` (their real schema sits under `draft.schema`).
    const cursor = db.collection('datasets').find(
      { _searchText: { $exists: false }, 'schema.0': { $exists: true } },
      { projection: { id: 1, owner: 1, schema: 1, permissions: 1 } }
    )
    const ops: AnyBulkWriteOperation<any>[] = []
    const flush = async () => {
      if (ops.length) await db.collection('datasets').bulkWrite(ops, { ordered: false })
      stamped += ops.length
      ops.length = 0
    }
    for await (const dataset of cursor) {
      const _searchText = computeSearchText(dataset as any, await catalogSearchOf(dataset.owner))
      if (!_searchText) continue
      ops.push({ updateOne: { filter: { _id: dataset._id }, update: { $set: { _searchText } } } })
      if (ops.length >= 200) await flush()
    }
    await flush()
    debug(`stamped _searchText on ${stamped} datasets`)
  }
}

export default upgradeScript
