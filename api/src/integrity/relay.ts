import mongo from '#mongo'
import config from '#config'
import filesStorage from '#files-storage'
import type { DatasetInternal } from '#types'
import { isFileDataset } from '#types/dataset/index.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import { integrityStore } from './store-factory.ts'
import { sha256OfStorageFile, sha256Tee } from './hash.ts'
import type { RevisionBody } from './store.ts'
import * as ops from './operations.ts'

// Compute both hashes from the authoritative sources (stored file bytes + fresh Mongo doc),
// dedupe against the latest anchor, write the next locked revision and persist the
// integrity.lastRevision hint. Shared by the async relay (organic writes) and the synchronous
// admin routes (enable / fixIntegrity / restore).
export const anchorDataset = async (dataset: DatasetInternal, hint?: ops.HistorizeContextHint, opts?: { force?: boolean }): Promise<void> => {
  const store = integrityStore()
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + (config.integrity!.retention?.days ?? 365) * 24 * 3600 * 1000)

  const hash: { file?: string, metadata?: string } = {}
  // Hash the actual stored file, NOT dataset.originalFile's hash fields: an out-of-band edit
  // (exactly what fixIntegrity reconciles) never updates that metadata field, so anchoring it
  // would dedupe and never re-anchor. Hashing the stored file keeps the relay symmetric with the
  // checker.
  if (isFileDataset(dataset)) {
    const fileHash = await sha256OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      // missing file (both backends normalize to 404): genuinely nothing to anchor for the file part
      if (err.status === 404) return undefined
      throw err // transient storage error: propagate so the caller/worker retries
    })
    if (fileHash) hash.file = fileHash
  }
  // re-read the freshest doc: the caller's copy may lag behind the write that set the flag,
  // and the checker hashes the live doc — relay and checker must see the same state
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  if (!fresh) return // deleted in the meantime
  hash.metadata = ops.metadataHash(fresh)

  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const keys = (await store.listRevisions(prefix, { delimiter: '/' })).map((r) => r.key)
  const latest = ops.latestKey(keys)
  // read the latest revision once: the full dedupe below needs its hash pair, and the payload
  // reference dedupe further down needs its payload.file descriptor (both on force and non-force)
  const latestRevision = latest ? await store.getRevision(latest) : undefined
  // restore bypasses the dedupe: it is a rare, explicitly-reasoned remediation action that must
  // always leave its own auditable 'restore' revision, even when it lands back on a state that is
  // byte-identical to a prior anchor (e.g. undoing an out-of-band tamper restores the exact
  // pre-tamper metadata) — otherwise the action would silently vanish from the revision history.
  if (latest && latestRevision && !opts?.force) {
    const latestHash = latestRevision.hash
    // level 2: only a payload-bearing anchor is a valid dedupe target — an L1-era anchor
    // with matching hashes still gets a fresh revision, so the store self-heals to level 2
    if (latestHash.file === hash.file && latestHash.metadata === hash.metadata && latestRevision.payload) {
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
  // payload FIRST, revision JSON second: a crash in between leaves an orphan .file that ages
  // out harmlessly — the reverse would leave a revision claiming a payload it doesn't have
  const payload: NonNullable<RevisionBody['payload']> = { metadata: ops.coveredMetadata(fresh) }
  if (hash.file) {
    // payload reference dedupe: when the stored file is byte-identical to the latest anchor's
    // payload (a metadata-only change, or a metadata-only restore that lands back on the same
    // bytes), do NOT upload a second locked copy — reference the existing one. References always
    // collapse to the bytes-owning revision (never chain): the latest anchor's `file.i` already
    // points at the owner, or, absent, the latest revision owns its own bytes.
    if (latestRevision?.payload?.file && latestRevision.hash.file === hash.file) {
      const refIndex = latestRevision.payload.file.i ?? ops.parseRevisionIndex(latest!)
      // extend the referenced payload's lock to this revision's retain-until so every referencing
      // revision's file outlives it, even after the superseded payload itself stops sliding
      await store.extendRetention(ops.payloadKey(dataset.owner, dataset.id, refIndex), retainUntil)
      payload.file = { size: latestRevision.payload.file.size, i: refIndex }
      // no tee on this branch: the bytes are unchanged, so the first-pass hash already describes them
    } else {
      const { body, size } = await filesStorage.readStream(datasetUtils.originalFilePath(dataset))
      const tee = sha256Tee()
      body.on('error', (err) => tee.stream.destroy(err))
      await store.writePayload(ops.payloadKey(dataset.owner, dataset.id, i), body.pipe(tee.stream), retainUntil)
      // the file may have changed since the dedupe-check read: the anchor must describe the
      // payload's actual bytes, so the teed hash wins over the first-pass one
      hash.file = tee.digest()
      payload.file = { size }
    }
  }
  await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, i), {
    hash,
    context,
    dataset: { id: dataset.id, slug: dataset.slug },
    payload
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

  // a 'restore' context reaching the async relay comes from the _restore route's file path
  // (finalize preserved the context through the draft): force the anchor so the remediation
  // always leaves its own auditable revision, even when the re-ingested bytes/metadata land
  // back on a state byte-identical to a prior anchor — mirrors the metadata path's force:true
  const context = dataset._needsHistorizing?.context
  await anchorDataset(dataset, context, { force: context?.operation === 'restore' })
  // Known narrow window (accepted): a stamp written while this relay run is in-flight can be
  // cleared by this unconditional $unset and thus dropped. Fail-loud: the next sliding check
  // re-detects the mismatch and alerts; a follow-up _fix recovers.
  await clearFlag()
}
