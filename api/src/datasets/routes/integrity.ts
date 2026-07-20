import { type Router } from 'express'
import path from 'node:path'
import mime from 'mime-types'
import contentDisposition from 'content-disposition'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import clone from '@data-fair/lib-utils/clone.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import filesStorage from '#files-storage'
import { reqDataset, readDataset } from '../middlewares.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as datasetUtils from '../utils/index.ts'
import { preparePatch } from '../utils/patch.ts'
import { fallbackMimeTypes } from '../utils/upload.ts'
import { applyPatch } from '../service.ts'
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import * as restUtils from '../utils/rest.ts'
import { integrityStore } from '../../integrity/store-factory.ts'
import { revisionPrefix, parseRevisionIndex, isPayloadKey, revisionKey, payloadKey, restoreUpdate, rehydrateTopics, coveredMetadata } from '../../integrity/operations.ts'
import { anchorDataset } from '../../integrity/relay.ts'
import { md5OfStorageFile } from '../../integrity/hash.ts'
import pump from '../../misc/utils/pipe.ts'

export const registerIntegrityRoutes = (router: Router) => {
  router.put('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    const active = !!req.body?.active
    if (active) {
      if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
      const isRest = isRestDataset(dataset)
      if (!isRest && (!isFileDataset(dataset) || !dataset.originalFile?.md5)) {
        throw httpError(400, 'integrity can only be enabled on a finalized file dataset or an editable (rest) dataset')
      }
      if (isRest) {
        // the coverage gate (target 3): per-line anchors mean per-line writes, checks and lock
        // renewals — refuse enrollment where that burden is not tractable
        const maxLines = config.integrity.lines?.maxLines ?? 100000
        const liveLines = await restUtils.count(dataset, { _deleted: { $ne: true } })
        if (liveLines > maxLines) throw httpError(409, `this dataset has ${liveLines} lines, above the integrity gate of ${maxLines}`)
      }
      const retentionDays = config.integrity.retention?.days ?? 365
      const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
      // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
      // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
      const $set: Record<string, any> = { 'integrity.active': true, updatedAt: new Date().toISOString() }
      // baseline for the per-line renewal cadence: conservative (backfill revisions written by
      // the relay get equal-or-later locks, so renewal triggers no later than needed)
      if (isRest) $set['integrity.linesRenewal'] = { date: new Date().toISOString(), status: 'ok', retainUntil: retainUntil.toISOString() }
      await mongo.datasets.updateOne({ id: dataset.id }, { $set })
      // anchor synchronously: enable is a rare superadmin action, and the response then reflects
      // the anchored state. On failure (S3 down) active stays true with no anchor — the check
      // reports 'unknown' and a later _fix retries (fail-loud, no compensating rollback).
      await anchorDataset(dataset, { operation: 'enable', origin: 'superadmin' })
      if (isRest) {
        // async backfill: stamp every line (hint-first) and let the relay drain; GET _integrity
        // reports pending progress and checks stay 'unknown' until drained
        await restUtils.collection(dataset).createIndex({ _needsHistorizing: 1 }, { sparse: true })
        await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
        await restUtils.collection(dataset).updateMany({}, { $set: { _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } } } })
      }
    } else {
      await mongo.datasets.updateOne({ id: dataset.id }, {
        // clear the verdicts and any pending relay work: a disabled dataset must not keep showing
        // a breach badge / error-filter listing it no longer allows acting on
        $set: { integrity: { active: false }, updatedAt: new Date().toISOString() },
        $unset: { _needsHistorizing: '', _needsHistorizingLines: '' }
      })
    }
    res.status(200).json({ active })
  })

  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), permissions.middleware('readIntegrity', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    const integrity = { ...(dataset.integrity ?? { active: false }) }
    if (integrity.active && isRestDataset(dataset)) {
      const c = restUtils.collection(dataset)
      const maxLines = config.integrity?.lines?.maxLines ?? 100000
      const [total, pending] = await Promise.all([
        restUtils.count(dataset, { _deleted: { $ne: true } }),
        c.countDocuments({ _needsHistorizing: { $exists: true } })
      ])
      integrity.lines = { anchored: Math.max(0, total - pending), pending, ...(total > maxLines ? { overGate: true } : {}) }
    }
    res.json(integrity)
  })

  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    // synchronous re-anchor + verify: the reconcile action responds with a fresh verdict
    await anchorDataset(dataset, { operation: 'fixIntegrity', origin: 'superadmin', reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined })
    // the synchronous anchor above just serviced whatever a pending stamp requested: clear it so
    // checkDataset's pending guard doesn't force an 'unknown' verdict on the fresh read below
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
    const checker = await import('../../integrity/checker.ts')
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(fresh as any))
  })

  router.post('/:datasetId/_integrity/_restore', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = req.body?.i
    if (!Number.isInteger(i) || i < 0) throw httpError(400, 'missing or invalid revision index "i"')
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    const store = integrityStore()
    const revision = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    if (!revision.payload) throw httpError(400, 'this revision has no payload (level-1 anchor): not restorable')

    // file part: the stored file's actual bytes vs the revision's md5 (metadata fields can lie).
    // Computed and gated up front, BEFORE the metadata write below: a file restore refused with 409
    // must not have already applied its metadata $set/$unset. Metadata-only restores (no file
    // divergence) stay ungated.
    const currentMd5 = isFileDataset(dataset)
      ? await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err: any) => {
        if (err.status === 404) return undefined
        throw err
      })
      : undefined
    const needsFileRestore = !!(revision.payload.file && revision.hash.md5 !== currentMd5)
    if (needsFileRestore) {
      // re-ingesting mutates the dataset through the full pipeline; refuse while it is mid-processing
      // (only a settled finalized/error dataset is safe to route a fresh file replacement through)
      if (dataset.status !== 'finalized' && dataset.status !== 'error') {
        throw httpError(409, 'dataset is not in a stable state (finalized/error) for a file restore')
      }
    }

    // metadata part: write back only the genuinely diverging covered keys
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    if (!fresh) throw httpError(404, 'dataset not found')
    const { $set, $unset } = restoreUpdate(fresh, revision.payload.metadata)
    if ($set.topics) {
      const settings = await mongo.db.collection('settings').findOne({ type: dataset.owner.type, id: dataset.owner.id })
      $set.topics = rehydrateTopics($set.topics, settings?.topics ?? [])
    }
    if (Object.keys($set).length || Object.keys($unset).length) {
      const update: any = { $set: { ...$set, updatedAt: new Date().toISOString() } }
      if (Object.keys($unset).length) update.$unset = $unset
      await mongo.datasets.updateOne({ id: dataset.id }, update)
    }

    if (needsFileRestore) {
      // re-ingest through the standard file-replacement path (spec §C): the payload lands in the
      // loading dir exactly as an upload would, preparePatch/applyPatch route it through the
      // draft pipeline, and finalize re-anchors with the restore context riding the draft
      const filename = revision.payload.metadata.originalFile?.name ?? dataset.originalFile?.name ?? 'restored-file'
      const destination = datasetUtils.loadingDir({ ...dataset, draftReason: true })
      const finalPath = path.join(destination, filename)
      // payload reference dedupe: the bytes may live under an earlier revision's `{i}.file`
      // (absent `file.i` = this revision owns them)
      const fileRefIndex = revision.payload.file?.i ?? i
      const { body } = await store.readPayload(payloadKey(dataset.owner, dataset.id, fileRefIndex))
      await filesStorage.writeStream(body, finalPath)
      const stats = await filesStorage.fileStats(finalPath)
      // mime type is broken on windows it seems.. detect based on extension instead (mirrors upload.ts's fileFilter)
      const mimetype = mime.lookup(filename) || fallbackMimeTypes[filename.split('.').pop() as string] || filename.split('.').pop()
      const files = [{ fieldname: 'file', originalname: filename, filename, destination, path: finalPath, size: stats.size, md5: revision.hash.md5, mimetype }]

      const patch: any = { _needsHistorizing: { context: { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}) } } }
      // the metadata $set/$unset above may have just restored `file`/`originalFile` on the Mongo
      // doc (both are covered fields a metadata tamper can unset); preparePatch/applyPatch must
      // see that post-restore state, not the stale route-entry `dataset` — otherwise a healed
      // `file` still reads as absent on the clone and preparePatch's file-based guard throws 400
      // even though the metadata write already landed.
      const postMetadataDataset = await mongo.datasets.findOne({ id: dataset.id })
      if (!postMetadataDataset) throw httpError(404, 'dataset not found')
      const datasetClone: any = clone(postMetadataDataset)
      await preparePatch(req.app, patch, datasetClone, reqSessionAuthenticated(req), req.getLocale(), 'always', files)
      await applyPatch(datasetClone, patch)
      res.json({ status: 'restoring' })
      return
    }

    // metadata-only restore (file part handled above): re-anchor
    // synchronously with the restore context and respond with the fresh verdict, like _fix.
    // force: true — restore must always leave its own auditable revision, even when the
    // corrected state lands back on one identical to a prior anchor (anchorDataset's normal
    // dedupe would otherwise silently swallow the remediation, see relay.ts for detail)
    await anchorDataset(dataset, { operation: 'restore', origin: 'superadmin', reason }, { force: true })
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
    const checker = await import('../../integrity/checker.ts')
    const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(freshAfter as any))
  })

  router.post('/:datasetId/_integrity/_check', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const checker = await import('../../integrity/checker.ts')
    res.json(await checker.checkDataset(dataset))
  })

  router.get('/:datasetId/_integrity/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const store = integrityStore()
    // zero-padded indices sort lexically == numerically; newest first = reversed
    const keys = (await store.listRevisions(revisionPrefix(dataset.owner, dataset.id), { delimiter: '/' })).map((r) => r.key)
      .filter((k) => !isPayloadKey(k)).sort().reverse()
    const count = keys.length
    const size = Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100)
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1
    const results = await Promise.all(keys.slice((page - 1) * size, (page - 1) * size + size).map(async (key) => {
      const rev = await store.getRevision(key)
      return {
        i: parseRevisionIndex(key),
        hash: rev.hash,
        date: rev.context.date,
        operation: rev.context.operation,
        origin: rev.context.origin,
        ...(rev.context.reason ? { reason: rev.context.reason } : {}),
        hasPayload: !!rev.payload,
        ...(rev.payload?.file ? { fileSize: rev.payload.file.size } : {})
      }
    }))
    res.json({ count, results })
  })

  router.get('/:datasetId/_integrity/revisions/:i', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = parseInt(req.params.i as string, 10)
    if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
    const store = integrityStore()
    const rev = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    // `current` is the live covered projection so the UI can render the metadata diff in one call
    res.json({ i, hash: rev.hash, context: rev.context, payload: rev.payload, current: fresh ? coveredMetadata(fresh) : undefined })
  })

  router.get('/:datasetId/_integrity/revisions/:i/file', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = parseInt(req.params.i as string, 10)
    if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
    const store = integrityStore()
    const rev = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    if (!rev.payload?.file) throw httpError(404, 'this revision has no file payload')
    // payload reference dedupe: resolve the revision that owns the bytes (absent `file.i` = self)
    const refIndex = rev.payload.file.i ?? i
    const { body, size } = await store.readPayload(payloadKey(dataset.owner, dataset.id, refIndex))
    res.setHeader('content-disposition', contentDisposition(rev.payload.metadata.originalFile?.name ?? `${dataset.slug}-revision-${i}`))
    res.setHeader('content-type', rev.payload.metadata.originalFile?.mimetype ?? 'application/octet-stream')
    if (size !== undefined) res.setHeader('content-length', String(size))
    await pump(body, res)
  })
}
