// tests/features/integrity/attribution.api.spec.ts
// T2: the `.who` attribution sibling — store.writeWho/getWho, locked with its OWN retention
// (config integrity.attribution.retentionDays), shorter than the revision's own retention
// (config integrity.retention.days) and never extended. This is the MinIO proof that a
// per-object retain-until shorter than the sibling revision's is honored (design doc §6.1/§6.3).
// T3 (this file, extended): threading `who` from the HTTP boundary through the dataset-level
// write path — user PATCH, `_fix` after tamper, dedupe suppression, and the attribution kill
// switch.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, setConfig } from '../../support/workers.ts'
import {
  ensureIntegrityBucket, integrityTestStore, listIntegrityKeys,
  waitForIntegrityRevisions, waitForFlagCleared, revisionsPrefix
} from '../../support/integrity.ts'
import * as ops from '../../../api/src/integrity/operations.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('writeWho stores a compliance-locked .who sibling with its own (shorter) retention than the revision', async () => {
  const store = integrityTestStore
  const owner = { type: 'user', id: `test-attribution-${Date.now()}` }
  const datasetId = 'ds-attribution'
  const key = ops.revisionKey(owner, datasetId, 0)
  const whoKey = ops.whoKey(owner, datasetId, 0)
  expect(whoKey).toBe(`${key}.who`)

  const revisionRetainUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  const whoRetainUntil = new Date(Date.now() + 180 * 24 * 3600 * 1000)

  await store.writeRevision(key, {
    hash: { file: 'attr123' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: datasetId }
  }, revisionRetainUntil)

  const whoBody = { date: new Date().toISOString(), user: { id: 'alice' }, ip: '1.2.3.4' }
  await store.writeWho(whoKey, whoBody, whoRetainUntil)

  // both siblings read back independently
  const backRevision = await store.getRevision(key)
  expect(backRevision.hash.file).toBe('attr123')
  const backWho = await store.getWho(whoKey)
  expect(backWho).toEqual(whoBody)

  // and their retain-until dates genuinely differ: the .who sibling is shorter than its revision,
  // proving MinIO honors a per-object COMPLIANCE date distinct from (and shorter than) a sibling's
  const revisionRetention = await store.getRetention(key)
  const whoRetention = await store.getRetention(whoKey)
  expect(revisionRetention).toBeTruthy()
  expect(whoRetention).toBeTruthy()
  expect(whoRetention!.getTime()).toBeLessThan(revisionRetention!.getTime())
  expect(Math.abs(whoRetention!.getTime() - whoRetainUntil.getTime())).toBeLessThan(5000)
  expect(Math.abs(revisionRetention!.getTime() - revisionRetainUntil.getTime())).toBeLessThan(5000)
})

test('getWho normalizes a missing key the same way getRevision does', async () => {
  const store = integrityTestStore
  const missingKey = `data-fair/test-attribution-missing/${Date.now()}/000000000.who`
  await expect(store.getRevision(missingKey)).rejects.toMatchObject({ name: 'NoSuchKey' })
  await expect(store.getWho(missingKey)).rejects.toMatchObject({ name: 'NoSuchKey' })
})

// ---------------------------------------------------------------------------------------------
// pure guard (unit-style, T3): the relay's who-first write gate, extracted to operations.ts so
// it is testable without a live config module or a running server.
// ---------------------------------------------------------------------------------------------

test('shouldWriteWho: only when a who is present AND the kill switch is not explicitly off', () => {
  expect(ops.shouldWriteWho(undefined, true)).toBe(false)
  expect(ops.shouldWriteWho(undefined, undefined)).toBe(false)
  expect(ops.shouldWriteWho({ user: { id: 'alice' } }, true)).toBe(true)
  expect(ops.shouldWriteWho({ user: { id: 'alice' } }, undefined)).toBe(true) // default active
  expect(ops.shouldWriteWho({ user: { id: 'alice' } }, false)).toBe(false) // kill switch
})

// ---------------------------------------------------------------------------------------------
// T3: threading `who` from the HTTP boundary through the dataset-level write path (relay.ts
// anchorDataset + the stamp sites in datasets/service.ts and integrity/service.ts)
// ---------------------------------------------------------------------------------------------

test('a user PATCH on an enrolled dataset writes a `.who` sibling with the user id and an ip', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  // enable is synchronous and superadmin-attributed: rev 0 already carries the enabling admin's who
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  const who0 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 0))
  expect(who0.user?.id).toBe('test_superadmin')
  expect(who0.ip).toBeTruthy()

  // a metadata-only PATCH is a covered change → rev 1, references rev 0's payload (no new .file)
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'attribution test' })
  await waitForIntegrityRevisions(prefix, 3) // rev0 JSON + .file, rev1 JSON
  await waitForFlagCleared(dataset.id)

  const who1 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))
  expect(who1.user?.id).toBe('test_superadmin')
  expect(who1.ip).toBeTruthy()
  expect(who1.date).toBeTruthy()
})

test('a worker-origin re-anchor (no preceding request context) writes no `.who`', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2) // rev0 JSON + .file

  // simulate an organic worker re-anchor: new bytes out-of-band, then an empty stamp (no
  // context at all → anchorDataset defaults to origin 'worker', hint.who is undefined)
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'legitimate worker rewrite' })
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: {} })
  // rev0 JSON+.file+.who (enable is attributed), rev1 JSON+.file (worker-origin, no who) = 5
  const keys = await waitForIntegrityRevisions(prefix, 5)
  expect(keys.filter(k => !k.endsWith('.file') && !k.endsWith('.who')).length).toBe(2)

  await expect(integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))).rejects.toMatchObject({ name: 'NoSuchKey' })
})

test('_fix after an out-of-band tamper carries the fixing superadmin in `.who`', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  const fix = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).data
  expect(fix.status).toBe('ok')

  // _fix wrote a fresh revision (index 1: the tampered hash no longer matches rev 0)
  const keys = await listIntegrityKeys(prefix)
  expect(keys).toContain(`${prefix}000000001`)
  const who1 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))
  expect(who1.user?.id).toBe('test_superadmin')
})

test('dedupe writes no new revision and no new `.who`, even when the hint carries a who', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  const before = await listIntegrityKeys(prefix)
  expect(before.length).toBe(3) // rev0 JSON + .file + .who (enable is superadmin-attributed too)

  // no actual content change: the stamp carries a who, but anchorDataset's hash-match dedupe
  // returns early — BEFORE the who-first write — so no `.who` must appear either
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    _needsHistorizing: { context: { operation: 'update', origin: 'user', who: { user: { id: 'someone-else' }, ip: '9.9.9.9' } } }
  })
  await waitForFlagCleared(dataset.id)

  const after = await listIntegrityKeys(prefix)
  expect(after.sort()).toEqual(before.sort())
  await expect(integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))).rejects.toMatchObject({ name: 'NoSuchKey' })
})

test('a user PATCH drives the async relay to write the `.who` sibling with its OWN retain-until (attribution.retentionDays), distinct from the revision JSON\'s (retention.days)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // a metadata-only PATCH is a covered change → rev 1, written by the async relay (historize),
  // exercising anchorDataset's who-first write — the exact code path the review finding flags as
  // untested (T2 above calls store.writeWho directly, bypassing anchorDataset's formula entirely)
  const before = Date.now()
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'retention formula test' })
  await waitForIntegrityRevisions(prefix, 3) // rev0 JSON + .file, rev1 JSON
  await waitForFlagCleared(dataset.id)
  const after = Date.now()

  const revisionKey = ops.revisionKey(dataset.owner, dataset.id, 1)
  const whoKey = ops.whoKey(dataset.owner, dataset.id, 1)
  const revisionRetention = await integrityTestStore.getRetention(revisionKey)
  const whoRetention = await integrityTestStore.getRetention(whoKey)
  expect(revisionRetention).toBeTruthy()
  expect(whoRetention).toBeTruthy()

  // relay.ts anchorDataset computes, at two different lines:
  //   revision retain-until = now + config.integrity.retention.days
  //   .who     retain-until = now + config.integrity.attribution.retentionDays
  // The dev/test config (api/config/development.cjs) sets retention.days: 1 and
  // attribution.retentionDays: 1 — the SAME window length. This is deliberate upstream (see the
  // store-factory.ts startup assert: attribution.retentionDays must be <= retention.days), and it
  // means this test genuinely cannot prove a strict inequality between the two retain-until
  // instants, nor can it prove-by-value that a regression swapping `attribution?.retentionDays`
  // for `retention?.days` at that line was NOT made — with equal configured windows, both
  // formulas yield the same 1-day-out instant. What it DOES prove, end-to-end through the live
  // relay (not a direct store.writeWho call with a hand-picked date like T2 above):
  //  - anchorDataset actually reads a configured days value and turns it into a real
  //    ObjectLockRetainUntilDate on the `.who` object (not undefined, not some unrelated default)
  //  - that value lands within the [before, after] wall-clock window of the PATCH, +/- tolerance
  //  - the `.who` retention never exceeds the sibling revision's — the invariant the store-factory
  //    startup assert also enforces, now checked against what MinIO actually persisted
  // A future regression that swaps the two config paths would only be caught by THIS test in a
  // deployment/config where the two values differ (production default.cjs: 180 vs 365) — exactly
  // the gap the review finding flags; closing it fully would require the async relay's Piscina
  // worker to honor per-test config overrides, which tests/support/workers.ts's setConfig cannot
  // do (see the LIMITATION note below) without building config-reload machinery.
  const attributionRetentionMs = 1 * 24 * 3600 * 1000 // config.integrity.attribution.retentionDays (dev/test config)
  const toleranceMs = 60 * 60 * 1000 // 1h, generous for relay scheduling + worker clock skew
  expect(whoRetention!.getTime()).toBeGreaterThanOrEqual(before + attributionRetentionMs - toleranceMs)
  expect(whoRetention!.getTime()).toBeLessThanOrEqual(after + attributionRetentionMs + toleranceMs)
  // Not a strict `<=`: inside anchorDataset, `retainUntil` (revision) and `attributionRetainUntil`
  // (.who) are each stamped with their OWN `Date.now()` call, and the `.who` one runs LATER in the
  // function (after the file/metadata hashing and dedupe lookups) — so with equal configured
  // windows the `.who` retain-until can land a few milliseconds AFTER the revision's, not before.
  // A small tolerance (well above realistic in-process processing time, well below the 1-day
  // window itself) keeps this a same-window check without asserting an ordering the code doesn't
  // actually guarantee when the two config values are equal.
  const sameWindowToleranceMs = 5000
  expect(whoRetention!.getTime()).toBeLessThanOrEqual(revisionRetention!.getTime() + sameWindowToleranceMs)
})

// LIMITATION (documented per the brief rather than building config-reload machinery): `setConfig`
// (tests/support/workers.ts) mutates the config object of the MAIN thread only. The async relay
// (`historize`) runs as a `shortProcessor` Piscina task — a genuine separate worker thread
// (api/src/workers/tasks.ts) with its OWN `#config` module instance loaded fresh at thread
// startup, never touched by `setConfig`. Verified empirically while writing this test: a
// `test-env` echo of `config.integrity.attribution.active` stayed `false` on the main thread for
// the whole test, while the relay's own read of the same path (temporary debug log) still saw
// `true`. So the kill switch can only be exercised live, through HTTP, on the SYNCHRONOUS
// admin actions (enable / `_fix` / disable / restore / ack) that call `anchorDataset` inline in
// the request — never on the async PATCH → relay path. The pure guard itself (`shouldWriteWho`,
// tested above) is what actually stands in for full relay coverage of the kill switch.
test.describe('attribution kill switch (synchronous admin actions only — see limitation note above)', () => {
  test.beforeAll(async () => { await setConfig('integrity.attribution.active', false) })
  test.afterAll(async () => { await setConfig('integrity.attribution.active', true) })

  test('enable writes its revision but no `.who` while attribution is inactive', async () => {
    const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
    const dataset = await sendDataset('datasets/dataset1.csv', admin)
    await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
    await expect(integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 0))).rejects.toMatchObject({ name: 'NoSuchKey' })
  })

  test('_fix after a tamper writes its revision but no `.who` while attribution is inactive', async () => {
    const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
    const dataset = await sendDataset('datasets/dataset1.csv', admin)
    await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
    await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
    const fix = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).data
    expect(fix.status).toBe('ok')
    await expect(integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))).rejects.toMatchObject({ name: 'NoSuchKey' })
  })
})
