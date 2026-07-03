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
    { $unset: { _needsHistorizing: '', _historizeContext: '' } }
  )

  // capability disabled at the deployment level: drop the flag instead of letting integrityStore()
  // throw on every worker poll (retry storm). A later finalize re-sets the flag if re-enabled.
  if (!config.integrity?.active) { await clearFlag(); return }

  // Hash the actual stored file, NOT dataset.originalFile.md5: an out-of-band edit (exactly what
  // fixIntegrity reconciles) never updates that metadata field, so anchoring it would dedupe and
  // never re-anchor. Hashing the stored file keeps the relay symmetric with the checker (§3.3).
  const currentMd5 = isFileDataset(dataset)
    ? await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      // missing file (both backends normalize to 404): genuinely nothing to anchor
      if (err.status === 404) return undefined
      // anything else (transient storage error): propagate so the worker retries instead of
      // silently dropping this revision from the trail (review finding 5)
      throw err
    })
    : undefined
  if (!currentMd5) { await clearFlag(); return } // not a file dataset / no stored file → nothing to anchor

  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const keys = await store.listRevisionKeys(prefix)
  const latest = ops.latestKey(keys)
  if (latest) {
    const latestMd5 = (await store.getRevision(latest)).hash.md5
    if (latestMd5 === currentMd5) { await clearFlag(); return } // dedupe: already anchored
  }

  const i = ops.nextIndex(keys)
  const date = new Date().toISOString()
  const hint = dataset._historizeContext
  const operation: ops.RevisionOperation = hint?.operation ?? (i === 0 ? 'create' : 'update')
  const originator = hint?.originator ?? 'worker:historize'
  const retainUntil = new Date(Date.now() + config.integrity.retention.days * 24 * 3600 * 1000)

  await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, i), {
    hash: { md5: currentMd5 },
    context: ops.buildContext(operation, originator, date, hint?.reason),
    dataset: { id: dataset.id, slug: dataset.slug }
  }, retainUntil)

  // Known narrow window (accepted for this slice): a superadmin _fix/enable that re-sets
  // _needsHistorizing while this relay run is in-flight (the endpoints write outside the worker's
  // per-resource lock) can be cleared by this unconditional $unset and thus dropped. This never
  // weakens the guarantee — the next sliding check re-detects the still-mismatched file and re-alerts,
  // and a follow-up _fix recovers. A generation token on _historizeContext would close it; deferred.
  await mongo.datasets.updateOne(
    { id: dataset.id },
    { $set: { 'integrity.lastRevision': { i, md5: currentMd5, date } }, $unset: { _needsHistorizing: '', _historizeContext: '' } }
  )
}
