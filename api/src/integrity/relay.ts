import mongo from '#mongo'
import config from '#config'
import type { DatasetInternal } from '#types'
import { isFileDataset } from '#types/dataset/index.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import { integrityStore } from './store-factory.ts'
import { md5OfStorageFile } from './hash.ts'
import * as ops from './operations.ts'

export const historize = async (dataset: DatasetInternal): Promise<void> => {
  const clearFlag = () => mongo.datasets.updateOne(
    { id: dataset.id },
    { $unset: { _needsHistorizing: '' } }
  )

  // capability disabled at the deployment level: drop the flag instead of letting integrityStore()
  // throw on every worker poll (retry storm). A later finalize re-sets the flag if re-enabled.
  if (!config.integrity?.active) { await clearFlag(); return }
  // defensive: bulk propagation writers (topics/identities/settings) may stamp datasets whose
  // integrity is not active — drop silently rather than anchoring an un-enrolled dataset
  if (!dataset.integrity?.active) { await clearFlag(); return }

  const classes = dataset._needsHistorizing?.classes ?? []
  const hint = dataset._needsHistorizing?.context
  const store = integrityStore()
  const date = new Date().toISOString()
  // config.integrity is guaranteed defined here (active guard above); retention.days defaults to 365
  const retainUntil = new Date(Date.now() + (config.integrity!.retention?.days ?? 365) * 24 * 3600 * 1000)
  const lastRevisionSet: Record<string, any> = {}

  for (const cls of ops.INTEGRITY_CLASSES) {
    if (!classes.includes(cls)) continue

    let hash: { md5?: string, sha256?: string } | undefined
    if (cls === 'file') {
      // Hash the actual stored file, NOT dataset.originalFile.md5: an out-of-band edit (exactly what
      // fixIntegrity reconciles) never updates that metadata field, so anchoring it would dedupe and
      // never re-anchor. Hashing the stored file keeps the relay symmetric with the checker (§3.3).
      const md5 = isFileDataset(dataset)
        ? await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
          // missing file (both backends normalize to 404): genuinely nothing to anchor
          if (err.status === 404) return undefined
          // anything else (transient storage error): propagate so the worker retries instead of
          // silently dropping this revision from the trail
          throw err
        })
        : undefined
      if (md5) hash = { md5 }
    } else {
      // re-read the freshest doc: the poll copy may lag behind the write that set the flag,
      // and the checker will hash the live doc — relay and checker must see the same state
      const fresh = await mongo.datasets.findOne({ id: dataset.id })
      if (fresh) hash = { sha256: ops.metadataHash(fresh) }
    }
    if (!hash) continue // not a file dataset / doc deleted → nothing to anchor for this class

    const prefix = ops.revisionPrefix(dataset.owner, dataset.id, cls)
    const keys = (await store.listRevisions(prefix)).map((r) => r.key)
    const latest = ops.latestKey(keys)
    if (latest) {
      const latestHash = (await store.getRevision(latest)).hash
      if (latestHash.md5 === hash.md5 && latestHash.sha256 === hash.sha256) continue // dedupe: already anchored
    }

    const i = ops.nextIndex(keys)
    const operation: ops.RevisionOperation = hint?.operation ?? (i === 0 ? 'create' : 'update')
    await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, cls, i), {
      hash,
      context: ops.buildContext(operation, hint?.originator ?? 'worker:historize', date, hint?.reason),
      dataset: { id: dataset.id, slug: dataset.slug }
    }, retainUntil)
    lastRevisionSet[`integrity.${cls}.lastRevision`] = { i, hash, date, retainUntil: retainUntil.toISOString() }
  }

  // Known narrow window (accepted, unchanged from target 1): a stamp written while this relay run
  // is in-flight can be cleared by this unconditional $unset and thus dropped. Fail-loud: the next
  // sliding check re-detects the mismatch and alerts; a follow-up _fix recovers.
  await mongo.datasets.updateOne(
    { id: dataset.id },
    { ...(Object.keys(lastRevisionSet).length ? { $set: lastRevisionSet } : {}), $unset: { _needsHistorizing: '' } }
  )
}
