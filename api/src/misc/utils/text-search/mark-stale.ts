/**
 * Declare that documents need their search index recomputed, instead of recomputing inline.
 * This is the documented contract for bulk writers, upgrade scripts and anything touching the
 * database directly — a writer that skips it leaves the index silently stale, which is exactly
 * how `_searchText` acquired two stale paths before this existed.
 */
export const markStale = async (collection: { updateMany (filter: any, update: any): Promise<any> }, filter: any) => {
  await collection.updateMany(filter, { $set: { _needsSearchIndex: true } })
}
