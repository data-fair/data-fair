// tests/features/integrity/attribution.api.spec.ts
// T2: the `.who` attribution sibling — store.writeWho/getWho, locked with its OWN retention
// (config integrity.attribution.retentionDays), shorter than the revision's own retention
// (config integrity.retention.days) and never extended. This is the MinIO proof that a
// per-object retain-until shorter than the sibling revision's is honored (design doc §6.1/§6.3).
// T3 (this file, extended): threading `who` from the HTTP boundary through the dataset-level
// write path — user PATCH, `_fix` after tamper, dedupe suppression, and the attribution kill
// switch.
import { test, expect } from '@playwright/test'
import { axios, axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, setConfig, waitForFinalize } from '../../support/workers.ts'
import {
  ensureIntegrityBucket, integrityTestStore, listIntegrityKeys,
  waitForIntegrityRevisions, waitForFlagCleared, revisionsPrefix, waitForLinesDrained
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
  // T7: a UI-session write (no API key involved) must never carry an `apiKey` field
  expect(who1.apiKey).toBeUndefined()
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
  // The dev/test config (api/config/development.cjs) deliberately sets these to DIFFERENT window
  // lengths — retention.days: 2, attribution.retentionDays: 1 — precisely so a regression that
  // swaps `attribution?.retentionDays` for `retention?.days` (or vice versa) at either line
  // produces a value a day off and gets caught here, rather than being masked by two configured
  // windows that happen to coincide.
  const attributionRetentionMs = 1 * 24 * 3600 * 1000 // config.integrity.attribution.retentionDays (dev/test config)
  const revisionRetentionMs = 2 * 24 * 3600 * 1000 // config.integrity.retention.days (dev/test config)
  const toleranceMs = 60 * 60 * 1000 // 1h, generous for relay scheduling + worker clock skew
  expect(whoRetention!.getTime()).toBeGreaterThanOrEqual(before + attributionRetentionMs - toleranceMs)
  expect(whoRetention!.getTime()).toBeLessThanOrEqual(after + attributionRetentionMs + toleranceMs)
  expect(revisionRetention!.getTime()).toBeGreaterThanOrEqual(before + revisionRetentionMs - toleranceMs)
  expect(revisionRetention!.getTime()).toBeLessThanOrEqual(after + revisionRetentionMs + toleranceMs)
  // with genuinely distinct configured windows (1 day vs 2 days, an order of magnitude apart from
  // the 1h tolerance above), this is now a real, strict ordering assertion — not one that a
  // config-key swap could still satisfy by accident
  expect(whoRetention!.getTime()).toBeLessThan(revisionRetention!.getTime())
})

// ---------------------------------------------------------------------------------------------
// T7: `.who.apiKey.id` — when a write is authenticated by an API key, the key's opaque id must be
// recorded in the `.who` sibling (never in `RevisionContext`, which stays identity-free — design
// §5.1 supersedes an older sketch that would have put a key ref on the locked revision).
// ---------------------------------------------------------------------------------------------

test('a dataset PATCH authenticated with an organization API key attaches who.apiKey with the key id, no key title leaks', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', axOrg)
  const prefix = revisionsPrefix(dataset)
  // superadmin acts across orgs without needing membership (same pattern as lines.api.spec.ts)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2) // rev0 JSON + .file (enable, attributed to superadmin)

  const secretTitle = 'attribution-key-secret-title'
  const settingsRes = await axOrg.put('/api/v1/settings/organization/test_org1', {
    apiKeys: [{ title: secretTitle, scopes: ['datasets'] }]
  })
  const apiKey = settingsRes.data.apiKeys[0]
  const axApiKey = axios({ headers: { 'x-apiKey': apiKey.clearKey } })

  await axApiKey.patch(`/api/v1/datasets/${dataset.id}`, { description: 'attribution api key test' })
  await waitForIntegrityRevisions(prefix, 3) // rev1 JSON (references rev0's payload)
  await waitForFlagCleared(dataset.id)

  const who1 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))
  expect(who1.apiKey?.id).toBe(apiKey.id)
  // whatever the key-session resolves the user id to, assert what's actually there (T3/T4 territory)
  expect(who1.user?.id).toBe('apiKey:' + apiKey.id)
  // no leakage of the key TITLE anywhere in the stored `.who`
  expect(JSON.stringify(who1)).not.toContain(secretTitle)

  // the locked revision JSON itself stays identity-free: no apiKey/actor field anywhere on it
  const rev1 = await integrityTestStore.getRevision(ops.revisionKey(dataset.owner, dataset.id, 1))
  expect(rev1).not.toHaveProperty('apiKey')
  expect(rev1).not.toHaveProperty('actor')
  expect((rev1 as any).context).not.toHaveProperty('apiKey')
  expect((rev1 as any).context).not.toHaveProperty('actor')
  expect(Object.keys((rev1 as any).context).sort()).toEqual(['date', 'operation', 'origin'])
  expect(JSON.stringify(rev1)).not.toContain(secretTitle)
})

test('an adminMode+asAccount API key write (the processings path) attaches who.apiKey with the key id', async () => {
  const superadmin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await superadmin.put('/api/v1/settings/user/test_user1', {
    apiKeys: [{ title: 'processing-admin-key', scopes: ['datasets'], adminMode: true, asAccount: true }]
  })
  const key = res.data.apiKeys[0]
  // only usable from inside the infrastructure (assertReqInternal) — the dev/test harness satisfies
  // this the same way tests/features/auth/api-keys.api.spec.ts's own adminMode/asAccount test does
  const axKey = axios({
    headers: {
      'x-apiKey': key.clearKey,
      'x-account': JSON.stringify({ type: 'organization', id: 'test_org1', name: encodeURIComponent('Test Org 1') })
    }
  })

  const dataset = await sendDataset('datasets/dataset1.csv', axKey)
  const prefix = revisionsPrefix(dataset)
  await superadmin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2) // rev0 JSON + .file (enable, attributed to superadmin)

  await axKey.patch(`/api/v1/datasets/${dataset.id}`, { description: 'processing admin key test' })
  await waitForIntegrityRevisions(prefix, 3)
  await waitForFlagCleared(dataset.id)

  const who1 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))
  expect(who1.apiKey?.id).toBe(key.id)
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

// ---------------------------------------------------------------------------------------------
// T6: read-side enrichment — the revisions endpoints surface the `.who` sibling's content
// alongside each item, without ever failing the listing when a sibling is absent (the NORMAL
// state once a `.who` ages out at 180 days, or for pre-attribution/worker-origin revisions).
// ---------------------------------------------------------------------------------------------

const restDataset = async (ax: any, lines: Array<Record<string, any>>) => {
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity attribution ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }]
  })
  const dataset = res.data
  if (lines.length) await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, lines.map((l, i) => ({ _id: `line${i}`, ...l })))
  return dataset
}

test('owner-admin (non-superadmin) reads the revisions listing and sees `who` (user id + ip) on the attributed item', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const owner = await axiosAuth('test_superadmin@test.com', undefined, false) // same account, personal owner, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true }) // rev 0, attributed to the superadmin
  await waitForIntegrityRevisions(prefix, 2) // rev0 JSON + .file

  const res = (await owner.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(res.count).toBe(1)
  expect(res.results[0].who).toMatchObject({ user: { id: 'test_superadmin' } })
  expect(res.results[0].who.ip).toBeTruthy()
})

test('a revision listing item with no `.who` sibling simply lacks `who`, response shape stable', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2)

  // simulate a worker-origin re-anchor (no who hint at all, mirrors the sibling test above)
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'legitimate worker rewrite' })
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: {} })
  await waitForIntegrityRevisions(prefix, 4) // rev0 JSON+.file+.who, rev1 JSON+.file (no who)

  const res = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(res.count).toBe(2)
  const rev1 = res.results.find((r: any) => r.i === 1)
  expect(rev1).toBeTruthy()
  expect(rev1).not.toHaveProperty('who')
  const rev0 = res.results.find((r: any) => r.i === 0)
  expect(rev0.who).toMatchObject({ user: { id: 'test_superadmin' } })
})

test('GET revisions/{i} includes `who` alongside the snapshot', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2)

  const detail = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions/0`)).data
  expect(detail.who).toMatchObject({ user: { id: 'test_superadmin' } })
  expect(detail.who.ip).toBeTruthy()
})

test('GET revisions/{i} has no `who` when the sibling is absent, shape stable', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2)
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'legitimate worker rewrite' })
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: {} })
  await waitForIntegrityRevisions(prefix, 4)

  const detail = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions/1`)).data
  expect(detail).not.toHaveProperty('who')
})

test('owner-admin reads a line revision listing and sees `who` on the attributed item', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const owner = await axiosAuth('test_superadmin@test.com', undefined, false)
  const dataset = await restDataset(admin, [{ attr1: 'v1' }])
  await waitForFinalize(admin, dataset.id)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true }) // logged-in write → attributed
  await waitForLinesDrained(admin, dataset.id)

  const list = (await owner.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions`)).data
  expect(list.count).toBe(1)
  expect(list.results[0].who).toMatchObject({ user: { id: 'test_superadmin' } })
  expect(list.results[0].who.ip).toBeTruthy()

  const detail = (await owner.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions/${list.results[0].i}`)).data
  expect(detail.who).toMatchObject({ user: { id: 'test_superadmin' } })
})
