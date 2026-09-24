import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import type { AnyBulkWriteOperation, Db } from 'mongodb'
import { datasetsTextSearch, applicationsTextSearch } from '../../src/misc/utils/text-search/collections.ts'
import type { TextSearch } from '../../src/misc/utils/text-search/index.ts'
import { markStale } from '../../src/misc/utils/text-search/mark-stale.ts'

// Runs inline rather than lazily: a document without `_terms` is invisible to search, so leaving
// the drain to the worker would break search for the whole drain.
//
// This does NOT guarantee correctness from the first request. The runner
// (`@data-fair/lib-node/upgrade-scripts`) takes an `upgrade` lock, and a process that fails to get
// it just logs a warning and starts serving — its own source spells the consequence out: "this
// behaviour ... implies that they cannot be considered a pre-requisite". So in a multi-pod deploy
// exactly one pod backfills while the others already answer `q=` against documents that still have
// no `_terms` and therefore match nothing. Catalog search is degraded instance-wide for the length
// of the backfill, then converges on its own — see the "backfill window" section of
// docs/architecture/catalog-search.md. Running inline here only makes that window as short as it
// can be from this side; it does not close it.
//
// Must run after 01-backfill-search-text: `_searchText` is itself one of the fields the datasets
// definition indexes (see collections.ts), so building the index before that script would index
// datasets without their schema-derived content.
const backfill = async (db: Db, collectionName: string, textSearch: TextSearch, debug: (msg: string) => void) => {
  const collection = db.collection(collectionName)
  const version = textSearch.definition.version
  // idempotent: everything already at the current version is skipped, so a re-run — or a run
  // resumed after a crash — only fills the remaining gaps. Reuses the same contract bulk writers
  // and the worker rely on, so a run interrupted here leaves documents the worker can still drain.
  await markStale(collection, { '_searchIndex.v': { $ne: version } })

  let stamped = 0
  const ops: AnyBulkWriteOperation<any>[] = []
  const flush = async () => {
    if (!ops.length) return
    await collection.bulkWrite(ops, { ordered: false })
    stamped += ops.length
    ops.length = 0
  }
  for await (const doc of collection.find({ _needsSearchIndex: true })) {
    const fields = textSearch.buildIndexFields(doc)
    // a document with nothing indexable gets its index fields REMOVED, not set to null — same
    // contract as searchIndexPatch and the worker, so every writer leaves the same shape behind
    const $set: Record<string, any> = { _searchIndex: { v: version, at: new Date().toISOString() } }
    const $unset: Record<string, any> = { _needsSearchIndex: '' }
    for (const [key, value] of Object.entries({ _terms: fields?._terms, _pos: fields?._pos, _len: fields?._len })) {
      if (value === undefined) $unset[key] = ''
      else $set[key] = value
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set, $unset } } })
    if (ops.length >= 200) await flush()
  }
  await flush()
  debug(`stamped the search index on ${stamped} ${collectionName}`)
}

const upgradeScript: UpgradeScript = {
  description: 'Build the term/position search index on existing datasets and applications',
  async exec (db, debug) {
    await backfill(db, 'datasets', datasetsTextSearch, debug)
    await backfill(db, 'applications', applicationsTextSearch, debug)
  }
}

export default upgradeScript
