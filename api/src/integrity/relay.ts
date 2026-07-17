import mongo from '#mongo'
import config from '#config'
import type { DatasetInternal } from '#types'
import { isFileDataset } from '#types/dataset/index.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import { integrityStore } from './store-factory.ts'
import { md5OfStorageFile } from './hash.ts'
import * as ops from './operations.ts'

// Compute both hashes from the authoritative sources (stored file bytes + fresh Mongo doc),
// dedupe against the latest anchor, write the next locked revision and persist the
// integrity.lastRevision hint. Shared by the async relay (organic writes) and the synchronous
// admin routes (enable / fixIntegrity).
export const anchorDataset = async (dataset: DatasetInternal, hint?: ops.HistorizeContextHint): Promise<void> => {
  const store = integrityStore()
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + (config.integrity!.retention?.days ?? 365) * 24 * 3600 * 1000)

  const hash: { md5?: string, sha256?: string } = {}
  // Hash the actual stored file, NOT dataset.originalFile.md5: an out-of-band edit (exactly what
  // fixIntegrity reconciles) never updates that metadata field, so anchoring it would dedupe and
  // never re-anchor. Hashing the stored file keeps the relay symmetric with the checker.
  if (isFileDataset(dataset)) {
    const md5 = await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      // missing file (both backends normalize to 404): genuinely nothing to anchor for the file part
      if (err.status === 404) return undefined
      throw err // transient storage error: propagate so the caller/worker retries
    })
    if (md5) hash.md5 = md5
  }
  // re-read the freshest doc: the caller's copy may lag behind the write that set the flag,
  // and the checker hashes the live doc — relay and checker must see the same state
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  if (!fresh) return // deleted in the meantime
  hash.sha256 = ops.metadataHash(fresh)

  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const keys = (await store.listRevisions(prefix)).map((r) => r.key)
  const latest = ops.latestKey(keys)
  if (latest) {
    const latestRevision = await store.getRevision(latest)
    const latestHash = latestRevision.hash
    if (latestHash.md5 === hash.md5 && latestHash.sha256 === hash.sha256) {
      // disable→re-enable dedupe constraint: PUT _integrity {active:false} replaces the whole
      // integrity object (wiping integrity.lastRevision); a later re-enable that dedupes against
      // this unchanged anchor must still restore that mirror, or it stays unset forever and the
      // checker's renewal gate (needsRenewal(undefined) === false) silently stops protecting the lock
      if (!fresh.integrity?.lastRevision) {
        const i = ops.parseRevisionIndex(latest)
        const retainUntil = await store.getRetention(latest)
        await mongo.datasets.updateOne({ id: dataset.id }, {
          $set: { 'integrity.lastRevision': { i, hash: latestHash, date: latestRevision.context.date, retainUntil: retainUntil?.toISOString() } }
        })
      }
      return // already anchored
    }
  }

  const i = ops.nextIndex(keys)
  const operation: ops.RevisionOperation = hint?.operation ?? (i === 0 ? 'create' : 'update')
  const context: ops.RevisionContext = {
    operation,
    origin: hint?.origin ?? 'worker',
    date,
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, i), {
    hash,
    context,
    dataset: { id: dataset.id, slug: dataset.slug }
  }, retainUntil)
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastRevision': { i, hash, date, retainUntil: retainUntil.toISOString() } }
  })
}

// The async relay behind the historize worker task, driven by the _needsHistorizing outbox flag.
export const historize = async (dataset: DatasetInternal): Promise<void> => {
  const clearFlag = () => mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })

  // capability disabled at the deployment level: drop the flag instead of letting integrityStore()
  // throw on every worker poll (retry storm). A later finalize re-sets the flag if re-enabled.
  if (!config.integrity?.active) { await clearFlag(); return }
  // defensive: bulk propagation writers may stamp datasets whose integrity is not active —
  // drop silently rather than anchoring an un-enrolled dataset
  if (!dataset.integrity?.active) { await clearFlag(); return }

  await anchorDataset(dataset, dataset._needsHistorizing?.context)
  // Known narrow window (accepted): a stamp written while this relay run is in-flight can be
  // cleared by this unconditional $unset and thus dropped. Fail-loud: the next sliding check
  // re-detects the mismatch and alerts; a follow-up _fix recovers.
  await clearFlag()
}
