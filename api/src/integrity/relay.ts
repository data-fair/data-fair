import mongo from '#mongo'
import config from '#config'
import type { DatasetInternal } from '#types'
import { integrityStore } from './store-factory.ts'
import * as ops from './operations.ts'

export const historize = async (dataset: DatasetInternal): Promise<void> => {
  const clearFlag = () => mongo.datasets.updateOne(
    { id: dataset.id },
    { $unset: { _needsHistorizing: '', _historizeContext: '' } }
  )

  // capability disabled at the deployment level: drop the flag instead of letting integrityStore()
  // throw on every worker poll (retry storm). A later finalize re-sets the flag if re-enabled.
  if (!config.integrity?.active) { await clearFlag(); return }

  const currentMd5 = dataset.originalFile?.md5
  if (!currentMd5) { await clearFlag(); return } // nothing stable to anchor

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

  await mongo.datasets.updateOne(
    { id: dataset.id },
    { $set: { 'integrity.lastRevision': { i, md5: currentMd5, date } }, $unset: { _needsHistorizing: '', _historizeContext: '' } }
  )
}
