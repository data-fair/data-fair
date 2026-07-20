// tests/features/integrity/core.api.spec.ts
// Covers the integrity store (WORM primitives), the anchoring relay (organic writes), the
// checker (breach detection + renewal) and lock-renewal edge cases — everything below the
// admin-facing routes, which live in admin.api.spec.ts.
import { test, expect } from '@playwright/test'
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, doAndWaitForFinalize, getRawDataset, collectNotifications } from '../../support/workers.ts'
import {
  ensureIntegrityBucket, integrityTestClient, integrityTestStore,
  listIntegrityKeys, waitForIntegrityRevisions, waitForFlagCleared, revisionsPrefix
} from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
// reset test-owned datasets + limit counters before each test (the shared suite convention); the
// integrity specs all run as the single test_superadmin, so without this their datasets accumulate
// and hit the dev nbDatasets quota. clean() spares dev_fixtures (owner.id !~ /^test_/).
test.beforeEach(async () => { await clean() })

// ---------------------------------------------------------------------------------------------
// store: the S3/MinIO WORM primitives, exercised directly (no HTTP layer involved)
// ---------------------------------------------------------------------------------------------

// MinIO enables versioning on object-lock buckets, so a plain DELETE adds a delete-marker and a plain
// PUT adds a new version rather than throwing. The WORM guarantee under test is that the *locked
// version's bytes cannot be destroyed within retention*: hard-deleting that specific version is
// rejected and its bytes remain readable. These helpers read the original locked version directly.
const originalVersionId = async (key: string): Promise<string> => {
  const res = await integrityTestClient.send(new ListObjectVersionsCommand({ Bucket: 'data-fair-integrity', Prefix: key }))
  const version = (res.Versions ?? []).find((v) => v.Key === key)
  if (!version?.VersionId) throw new Error(`no version found for ${key}`)
  return version.VersionId
}
const readVersion = async (key: string, versionId: string) => {
  const res = await integrityTestClient.send(new GetObjectCommand({ Bucket: 'data-fair-integrity', Key: key, VersionId: versionId }))
  return JSON.parse(await res.Body!.transformToString())
}

test('writeRevision stores a compliance-locked object that can be read back and listed', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store/${Date.now()}/000000000`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  await store.writeRevision(key, {
    hash: { md5: 'abc123' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-store', slug: 'ds-store' }
  }, retainUntil)

  const back = await store.getRevision(key)
  expect(back.hash.md5).toBe('abc123')
  const revisions = await store.listRevisions('data-fair/test-store/')
  const keys = revisions.map(r => r.key)
  expect(keys).toContain(key)
  // listRevisions surfaces the S3 object's LastModified metadata as-is; the revisions endpoint
  // itself sorts lexically by key today, but this keeps the field available for diagnostics
  const entry = revisions.find(r => r.key === key)
  expect(entry?.lastModified).toBeInstanceOf(Date)
})

test('a written revision is WORM: the locked version cannot be destroyed within retention', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-worm/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'worm' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-worm' }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const versionId = await originalVersionId(key)

  // A versioned hard-delete of the locked version must be rejected by COMPLIANCE object lock.
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key, VersionId: versionId })))
    .rejects.toThrow()
  // ...and the locked bytes remain readable and intact.
  const back = await readVersion(key, versionId)
  expect(back.hash.md5).toBe('worm')
})

test('overwriting a locked key never replaces the locked version: the original is retained', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-ow/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'v1' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-ow' }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const versionId = await originalVersionId(key)

  // A plain PUT without a lock header creates a new version on the versioned bucket; it must NOT
  // replace the locked version's bytes.
  await integrityTestClient.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: 'tampered' }))
  // The original locked version is still readable and unchanged.
  const back = await readVersion(key, versionId)
  expect(back.hash.md5).toBe('v1')
  // And that locked version still cannot be destroyed.
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key, VersionId: versionId })))
    .rejects.toThrow()
})

test('extendRetention increases a compliance lock and getRetention reflects it', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-renew/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'r' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-renew' }
  }, new Date(Date.now() + 24 * 3600 * 1000))

  const target = new Date(Date.now() + 2 * 24 * 3600 * 1000)
  await store.extendRetention(key, target)
  const got = await store.getRetention(key)
  expect(got).toBeTruthy()
  expect(Math.abs(got!.getTime() - target.getTime())).toBeLessThan(5000)
})

test('extendRetention cannot shorten a compliance lock', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-renew-shorten/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 's' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-shorten' }
  }, new Date(Date.now() + 2 * 24 * 3600 * 1000))

  await expect(store.extendRetention(key, new Date(Date.now() + 24 * 3600 * 1000))).rejects.toThrow()
})

test('writePayload stores a compliance-locked binary sibling object', async () => {
  const store = integrityTestStore
  const base = `data-fair/test-store-payload/${Date.now()}/000000000`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  const { Readable } = await import('node:stream')
  await store.writePayload(base + '.file', Readable.from(Buffer.from('payload-bytes')), retainUntil)

  const { body, size } = await store.readPayload(base + '.file')
  const chunks: Buffer[] = []
  for await (const c of body) chunks.push(c as Buffer)
  expect(Buffer.concat(chunks).toString()).toBe('payload-bytes')
  expect(size).toBe('payload-bytes'.length)

  // WORM: the locked payload version cannot be destroyed within retention
  const versionId = await originalVersionId(base + '.file')
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: base + '.file', VersionId: versionId })))
    .rejects.toThrow()
})

test('a revision body can carry an inline metadata payload', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-meta/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'abc', sha256: 'def' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-meta' },
    payload: { metadata: { title: 'snap' }, file: { size: 13 } }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const back = await store.getRevision(key)
  expect(back.payload?.metadata.title).toBe('snap')
  expect(back.payload?.file?.size).toBe(13)
})

// ---------------------------------------------------------------------------------------------
// relay: the async historize worker, driven by the _needsHistorizing outbox flag
// ---------------------------------------------------------------------------------------------

test('anchor carries the level-2 payload: inline metadata snapshot + locked .file sibling', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const keys = await listIntegrityKeys(prefix)
  expect(keys).toContain(`${prefix}000000000`)
  expect(keys).toContain(`${prefix}000000000.file`)

  const rev = await integrityTestStore.getRevision(`${prefix}000000000`)
  expect(rev.payload?.metadata.title).toBe(dataset.title)
  expect(rev.payload?.metadata.createdBy).toBeUndefined() // covered projection only
  expect(rev.payload?.file?.size).toBeGreaterThan(0)

  const { body } = await integrityTestStore.readPayload(`${prefix}000000000.file`)
  const chunks: Buffer[] = []
  for await (const c of body) chunks.push(c as Buffer)
  const { createHash } = await import('node:crypto')
  expect(createHash('md5').update(Buffer.concat(chunks)).digest('hex')).toBe(rev.hash.md5)
})

test('dedupe is payload-aware: an L1-era anchor self-heals to level 2', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // unchanged state and a payload-bearing latest anchor → dedupe, no new revision
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // simulate an L1-era anchor: write a payload-less revision as index 1 directly to the store
  const rev0 = await integrityTestStore.getRevision(`${prefix}000000000`)
  await integrityTestStore.writeRevision(`${prefix}000000001`, {
    hash: rev0.hash, context: { operation: 'update', origin: 'worker', date: new Date().toISOString() }, dataset: { id: dataset.id }
  }, new Date(Date.now() + 24 * 3600 * 1000))

  // hashes match but the latest anchor has no payload → a fresh payload-bearing revision is written
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  const keys = await listIntegrityKeys(prefix)
  expect(keys).toContain(`${prefix}000000002`)
  expect(keys).toContain(`${prefix}000000002.file`)
  expect((await integrityTestStore.getRevision(`${prefix}000000002`)).payload?.metadata).toBeTruthy()
})

test('relay writes a locked revision when _needsHistorizing is set, then dedupes', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  const prefix = revisionsPrefix(dataset)

  // simulate "integrity enabled" by flagging the doc directly (initial anchor)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    integrity: { active: true },
    _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }
  })

  // 2 keys: the revision JSON + its .file payload sibling (level-2 joint anchor)
  const keys = await waitForIntegrityRevisions(prefix, 2)
  expect(keys.filter(k => !k.endsWith('.file')).length).toBe(1)
  const raw = await getRawDataset(dataset.id)
  expect(raw._needsHistorizing).toBeUndefined()
  expect(raw.integrity.lastRevision.hash.md5).toBe(dataset.originalFile.md5)

  // flag again without a change → relay must dedupe (clears flag, writes no new revision)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: {} })
  await waitForFlagCleared(dataset.id)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)
})

test('flagging a REST dataset (no file) anchors metadata only: sha256 present, no md5', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const ds = (await ax.post('/api/v1/datasets', { isRest: true, title: 'rest-relay', schema: [{ key: 'a', type: 'string' }] })).data
  const prefix = revisionsPrefix(ds)
  // integrity.active: true is required to pass the relay's enrollment guard (historize() drops
  // the flag silently on un-enrolled datasets)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${ds.id}`, {
    integrity: { active: true },
    _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }
  })
  const keys = await waitForIntegrityRevisions(prefix, 1)
  expect(keys.length).toBe(1)
  // the joint anchor still anchors a REST (file-less) dataset — sha256 (metadata) only, no md5
  const rev = await integrityTestStore.getRevision(keys[0])
  expect(rev.hash.sha256).toBeTruthy()
  expect(rev.hash.md5).toBeUndefined()
})

test('a file replacement writes a new (second) revision', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  const prefix = revisionsPrefix(dataset)

  // establish the initial anchor (revision 0) for dataset1.csv
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    integrity: { active: true },
    _needsHistorizing: {}
  })
  // 2 keys: the revision JSON + its .file payload sibling (level-2 joint anchor)
  expect((await waitForIntegrityRevisions(prefix, 2)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // replace the file; the finalize hook sets _needsHistorizing because integrity.active is true,
  // and the new md5 (dataset2.csv) differs from the anchor → relay writes revision 1. The joint
  // anchor re-records the metadata hash too, but it's still ONE new revision.
  await doAndWaitForFinalize(ax, dataset.id, async () => {
    const FormData = (await import('form-data')).default
    const fs = (await import('fs-extra')).default
    const path = (await import('node:path')).default
    const form = new FormData()
    form.append('file', fs.readFileSync(path.resolve('./tests/resources/datasets/dataset2.csv')), 'dataset1.csv')
    await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: form.getHeaders() })
  })

  // 4 keys: 2 revisions × (JSON + .file payload)
  const keys = await waitForIntegrityRevisions(prefix, 4)
  expect(keys.filter(k => !k.endsWith('.file')).length).toBe(2)
})

// ---------------------------------------------------------------------------------------------
// payload reference dedupe: one locked file copy per distinct file version (§3.1 amendment)
// ---------------------------------------------------------------------------------------------

test('a metadata-only edit references the file-owning revision; a file change owns a fresh payload', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // rev 0 owns its own bytes: no reference index
  const rev0 = await integrityTestStore.getRevision(`${prefix}000000000`)
  expect(rev0.payload?.file?.i).toBeUndefined() // absent i = own index
  const ownSize = rev0.payload!.file!.size

  // metadata-only edit → rev 1 references rev 0's payload, and writes NO new .file key
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'metadata only change' })
  const afterMeta = await waitForIntegrityRevisions(prefix, 3)
  await waitForFlagCleared(dataset.id)
  expect(afterMeta.filter(k => !k.endsWith('.file')).length).toBe(2) // rev 0 + rev 1
  expect(afterMeta.filter(k => k.endsWith('.file')).length).toBe(1) // still only rev 0's payload
  expect(afterMeta).not.toContain(`${prefix}000000001.file`)
  const rev1 = await integrityTestStore.getRevision(`${prefix}000000001`)
  expect(rev1.payload?.file?.i).toBe(0) // references the bytes-owning revision
  expect(rev1.payload?.file?.size).toBe(ownSize)
  expect(rev1.hash.md5).toBe(rev0.hash.md5) // file bytes unchanged

  // a subsequent FILE change → rev 2 owns a fresh payload at its own index (no i)
  await doAndWaitForFinalize(admin, dataset.id, async () => {
    const FormData = (await import('form-data')).default
    const fs = (await import('fs-extra')).default
    const path = (await import('node:path')).default
    const form = new FormData()
    form.append('file', fs.readFileSync(path.resolve('./tests/resources/datasets/dataset2.csv')), 'dataset1.csv')
    await admin.post(`/api/v1/datasets/${dataset.id}`, form, { headers: form.getHeaders() })
  })
  // 5 keys: rev0, rev0.file, rev1 (reference, no .file), rev2, rev2.file
  const afterFile = await waitForIntegrityRevisions(prefix, 5)
  expect(afterFile).toContain(`${prefix}000000002.file`)
  const rev2 = await integrityTestStore.getRevision(`${prefix}000000002`)
  expect(rev2.payload?.file?.i).toBeUndefined() // owns its own bytes
  expect(rev2.hash.md5).not.toBe(rev0.hash.md5)
})

test('a referencing revision extends the owning payload at write time; renewal on a reference anchor slides the referenced payload', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  const ownPayloadKey = `${prefix}000000000.file`
  const beforeRef = await integrityTestStore.getRetention(ownPayloadKey)

  // metadata-only edit → rev 1 references rev 0's payload
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'metadata only' })
  await waitForIntegrityRevisions(prefix, 3)
  await waitForFlagCleared(dataset.id)
  expect((await integrityTestStore.getRevision(`${prefix}000000001`)).payload?.file?.i).toBe(0)

  // reference-time extension: writing the referencing revision pushed the owning payload's
  // retain-until forward, so a superseded payload outlives every revision that references it
  const afterRef = await integrityTestStore.getRetention(ownPayloadKey)
  expect(afterRef!.getTime()).toBeGreaterThan(beforeRef!.getTime())

  // make the latest (a reference) anchor look due, then check → renewal must slide the REFERENCED
  // payload (rev 0's .file), since rev 1 has no .file object of its own
  const revBefore = await integrityTestStore.getRetention(`${prefix}000000001`)
  const payloadBefore = await integrityTestStore.getRetention(ownPayloadKey)
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastRevision.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastRenewal?.status).toBe('ok')
  const revAfter = await integrityTestStore.getRetention(`${prefix}000000001`)
  const payloadAfter = await integrityTestStore.getRetention(ownPayloadKey)
  expect(revAfter!.getTime()).toBeGreaterThan(revBefore!.getTime())
  expect(payloadAfter!.getTime()).toBeGreaterThan(payloadBefore!.getTime())
})

// ---------------------------------------------------------------------------------------------
// checker: breach detection + fix, on top of a synchronously-enabled dataset
// ---------------------------------------------------------------------------------------------

test('check is ok after enable, breach after out-of-band tamper, ok again after _fix re-anchors', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)

  // enable is synchronous: the anchor exists as soon as this returns, no wait needed
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // clean check
  let check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  // tamper the stored file out-of-band, then check → breach + event
  const notif = await collectNotifications()
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('file')
  const events = await notif.waitForCount(1)
  expect(events.some((e: any) => e.topic?.key?.includes('integrity-breach'))).toBe(true)

  // operator accepts the current stored bytes as legitimate → _fix re-anchors synchronously and
  // its response IS the fresh verdict, no manual _check needed
  const fix = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).data
  expect(fix.status).toBe('ok')
})

test('a check during a pending legitimate update never reports a breach', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const notif = await collectNotifications()
  // simulate a legitimate update whose relay has not run yet: new bytes + the flag, atomically
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'new legitimate content' })
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: {} })

  // the check may hit the pending window ('unknown') or run after the relay re-anchored ('ok') — never 'breach'
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(['unknown', 'ok']).toContain(check.status)

  // once the relay has anchored the new content the check is 'ok' (4 keys: 2 revisions × JSON + .file)
  await waitForIntegrityRevisions(prefix, 4)
  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('ok')

  await new Promise(resolve => setTimeout(resolve, 1500)) // settle: allow a stray event to arrive
  const all = await notif.getAll()
  expect(all.filter((e: any) => e.topic?.key?.includes('integrity-breach')).length).toBe(0)
})

test('out-of-band deletion of the stored file is reported as a breach', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { delete: true })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('file')
})

test('breach notification fires once per transition, not on every re-check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const notif = await collectNotifications()
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })

  // first check after tamper → breach + exactly one notification
  let check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  await notif.waitForCount(1)

  // second check while still breached → still breach, but NO new notification
  check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  await new Promise(resolve => setTimeout(resolve, 1500)) // settle: allow a stray event to arrive
  const all = await notif.getAll()
  expect(all.filter((e: any) => e.topic?.key?.includes('integrity-breach')).length).toBe(1)
})

// ---------------------------------------------------------------------------------------------
// renewal: lock-extension edge cases on top of a synchronously-enabled dataset
// ---------------------------------------------------------------------------------------------

// helper: enable integrity on a fresh dataset — enable is synchronous, so lastRevision (including
// retainUntil) is already persisted before the PUT returns, no polling needed
const enabledDataset = async (admin: any) => {
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  return { dataset, latestKey: `${revisionsPrefix(dataset)}000000000` }
}

test('a due anchor is renewed on check: retain-until advances and lastRenewal is ok', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)

  // force the persisted anchor to look old (due): retain-until ~1h out (< 22h)
  const soon = new Date(Date.now() + 3600 * 1000).toISOString()
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastRevision.retainUntil': soon })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  // pushed back to ~ now + 1 day, well beyond the patched 1h
  expect((new Date(state.lastRevision.retainUntil).getTime() - Date.now()) / 3600000).toBeGreaterThan(22)
  expect(state.lastRenewal?.status).toBe('ok')
})

test('a fresh anchor is not renewed by a check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)
  const before = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.lastRevision.retainUntil

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastRevision.retainUntil).toBe(before) // unchanged: not due
  expect(state.lastRenewal).toBeUndefined()
})

test('a breached check does not renew the lock', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)

  // due + tampered
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastRevision.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastRenewal?.status).not.toBe('ok') // renewal skipped on breach
  // retain-until stays the patched near-now value (not pushed forward)
  expect((new Date(state.lastRevision.retainUntil).getTime() - Date.now()) / 3600000).toBeLessThan(2)
})

test('a failed lock extension is recorded as lastRenewal.failed and does not fail the check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset, latestKey } = await enabledDataset(admin)

  // push the REAL S3 lock far into the future so a normal extend (~now+1day) would be a
  // forbidden shortening → the provider rejects it → the checker records a failure
  await integrityTestStore.extendRetention(latestKey, new Date(Date.now() + 10 * 24 * 3600 * 1000))
  // make the persisted mirror look due
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastRevision.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok') // a renewal failure does not fail the integrity check

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastRenewal?.status).toBe('failed')
  // the real lock is untouched (extend was rejected)
  const got = await integrityTestStore.getRetention(latestKey)
  expect((got!.getTime() - Date.now()) / (24 * 3600000)).toBeGreaterThan(9)
})

test('lock renewal extends the payload object too', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset, latestKey } = await enabledDataset(admin)
  const payloadKey = latestKey + '.file'

  // snapshot both real S3 locks right after the anchor write, before any renewal — dev retention
  // is only 1 day (see development.cjs), so comparing against an absolute far-future threshold
  // would not discriminate "renewed" from "just-created": both land ~1 day out. Comparing the
  // before/after timestamps directly does discriminate, regardless of the configured retention length
  const revBefore = await integrityTestStore.getRetention(latestKey)
  const payloadBefore = await integrityTestStore.getRetention(payloadKey)

  // force the persisted anchor to look old (due): retain-until ~1h out (< 22h) — same trick as
  // 'a due anchor is renewed on check'
  const soon = new Date(Date.now() + 3600 * 1000).toISOString()
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastRevision.retainUntil': soon })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastRenewal?.status).toBe('ok')

  // both the revision JSON and its .file sibling must have slid forward — the payload's lock
  // must not be left behind on its original, now-stale, retain-until
  const revAfter = await integrityTestStore.getRetention(latestKey)
  const payloadAfter = await integrityTestStore.getRetention(payloadKey)
  expect(revAfter!.getTime()).toBeGreaterThan(revBefore!.getTime())
  expect(payloadAfter!.getTime()).toBeGreaterThan(payloadBefore!.getTime())
})
