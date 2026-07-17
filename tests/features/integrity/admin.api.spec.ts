// tests/features/integrity/admin.api.spec.ts
// Covers the admin-facing surface: the enable/disable/_fix/_check/revisions routes, permission
// scoping, and the metadata-class historization flows (permissions, topics, publication sites).
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, anonymousAx, clean } from '../../support/axios.ts'
import { sendDataset, getRawDataset, collectNotifications } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions, waitForFlagCleared, revisionsPrefix } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
// reset test-owned datasets + limit counters before each test (the shared suite convention); the
// integrity specs all run as the single test_superadmin, so without this their datasets accumulate
// and hit the dev nbDatasets quota. clean() spares dev_fixtures (owner.id !~ /^test_/).
test.beforeEach(async () => { await clean() })

test('superadmin enable writes the initial anchor; non-admin is forbidden', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)

  await expect(user.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 403 })

  // enable is synchronous: the anchor exists as soon as the PUT returns, no wait needed
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  // 2 raw keys: the revision JSON + its .file payload sibling (level-2 joint anchor)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  const status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(status.active).toBe(true)
  expect(status.lastRevision.hash.md5).toBe(dataset.originalFile.md5)
  expect(status.lastRevision.hash.sha256).toBeTruthy()
})

test('enable is rejected on a dataset without an md5 file', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  // a REST dataset has no originalFile.md5
  const ds = (await admin.post('/api/v1/datasets', { isRest: true, title: 'rest-int', schema: [{ key: 'a', type: 'string' }] })).data
  await expect(admin.put(`/api/v1/datasets/${ds.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 400 })
})

test('_fix on an unchanged state dedupes (no spurious revision)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)
  // _fix is synchronous too
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  // unchanged state → dedupe → still exactly one revision
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)
})

test('revisions endpoint lists revisions newest-first and is readable by the owner admin', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true }) // revision 0 (joint anchor)
  // a _fix on the unchanged file dedupes, so tamper then _fix to get a 2nd revision
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`) // revision 1

  // raw store has 4 keys (2 revisions × JSON + .file); the revisions endpoint filters payloads out
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(2)
  const res = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(res.count).toBe(2)
  expect(res.results.length).toBe(2)
  // newest first
  expect(res.results[0].i).toBe(1)
  expect(res.results[1].i).toBe(0)
  expect(res.results[0]).toHaveProperty('hash')
  expect(res.results[0]).toHaveProperty('operation')
  expect(res.results[0]).toHaveProperty('origin')
  expect(res.results[0]).toHaveProperty('date')
  expect(res.results[0]).not.toHaveProperty('class')

  // pagination
  const page1 = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`, { params: { size: 1, page: 1 } })).data
  expect(page1.count).toBe(2)
  expect(page1.results.length).toBe(1)
  expect(page1.results[0].i).toBe(1)

  // the personal owner (admin of the owner account) can read the revisions
  expect((await user.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data.count).toBe(2)
})

test('integrity reads are allowed to the owner admin, writes stay superadmin-only', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const owner = await axiosAuth('test_superadmin@test.com', undefined, false) // same user = personal owner, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // owner (admin of the owner account) can read status and revisions
  expect((await owner.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.active).toBe(true)
  // enable writes ONE joint anchor
  expect((await owner.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data.count).toBe(1)
  // ...and sees the integrity field on the dataset
  expect((await owner.get(`/api/v1/datasets/${dataset.id}`)).data.integrity?.active).toBe(true)

  // writes remain superadmin-only
  await expect(owner.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })).rejects.toMatchObject({ status: 403 })
  await expect(owner.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).rejects.toMatchObject({ status: 403 })
  await expect(owner.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).rejects.toMatchObject({ status: 403 })
})

test('integrity state is hidden from readers who are not owner admins', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  // make the dataset publicly readable, then read it anonymously
  await admin.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['list', 'read'] }])
  const body = (await anonymousAx.get(`/api/v1/datasets/${dataset.id}`)).data
  expect(body.integrity).toBeUndefined()
  expect((await anonymousAx.get(`/api/v1/datasets/${dataset.id}`, { params: { select: 'id,integrity' } })).data.integrity).toBeUndefined()
  await expect(anonymousAx.get(`/api/v1/datasets/${dataset.id}/_integrity`)).rejects.toMatchObject({ status: 403 })
})

test('disabling integrity clears the breach state and error-filter listing', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('breach')

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })

  const status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(status.active).toBe(false)
  expect(status.lastCheck).toBeUndefined()
  // no longer surfaced under the error filter
  const list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  expect(list.results.find((d: any) => d.id === dataset.id)).toBeUndefined()
})

// Regression: PUT _integrity {active:false} replaces the whole integrity object (wiping
// lastRevision); a subsequent re-enable with unchanged content dedupes against the still-locked
// anchor and must restore that mirror, or it stays unset forever and the checker's renewal gate
// (needsRenewal(undefined) === false) silently stops protecting the anchor.
test('disable then re-enable with unchanged content restores lastRevision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const before = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(before.lastRevision).toBeTruthy()
  const i = before.lastRevision.i

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })
  // re-enable with the exact same file/metadata → the relay dedupes against the untouched anchor
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const after = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(after.lastRevision).toBeTruthy()
  expect(after.lastRevision.i).toBe(i)
  expect(after.lastRevision.retainUntil).toBeTruthy()
  // dedupe wrote no new revision
  const revisions = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(revisions.count).toBe(1)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)
})

test('internal historize fields are stripped from API responses', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  // set only _needsHistorizing (no integrity.active) — the relay now matches the $exists filter
  // and will clear it on its own poll, so assert the response stripping right away rather than
  // depending on a raw-doc read racing the worker's poll interval
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }
  })
  // patch-dataset does not bump updatedAt, so drop the read-cache to force a fresh mongo read
  await admin.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  const body = (await admin.get(`/api/v1/datasets/${dataset.id}`)).data
  expect(body._needsHistorizing).toBeUndefined()
})

test('breached dataset appears under the status=error listing without changing its status', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // not in error before the breach
  let list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  expect(list.results.find((d: any) => d.id === dataset.id)).toBeUndefined()

  // tamper + check → breach
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  // now it appears under status=error, but its real status is unchanged (finalized)
  list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  const row = list.results.find((d: any) => d.id === dataset.id)
  expect(row).toBeTruthy()
  expect(row.status).toBe('finalized')
  expect(row.integrity.lastCheck.status).toBe('breach')
})

// ---------------------------------------------------------------------------------------------
// metadata-class historization: covered-field writes, exclusions, and propagation flows
// ---------------------------------------------------------------------------------------------

test('an out-of-band covered-field write breaches metadata while file stays ok', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const notif = await collectNotifications()
  // test-env patch-dataset is a RAW mongo write with no outbox stamp — the exact tamper we detect
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered out-of-band' })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  expect(check.breach).toEqual(['metadata'])
  const events = await notif.waitForCount(1)
  expect(events.some((e: any) => e.topic?.key?.includes('integrity-breach'))).toBe(true)

  // operator accepts the current doc as legitimate → _fix re-anchors synchronously and returns the fresh verdict
  const fix = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).data
  expect(fix.status).toBe('ok')
})

test('an out-of-band write to an EXCLUDED field neither breaches nor creates a revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // status / count / errorStatus are denylisted operational fields: raw writes are expected there
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { status: 'error', errorStatus: 'oops', count: 999 })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)
})

test('a legitimate metadata PATCH historizes a new revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'legitimate new description' })

  // 4 raw keys: 2 revisions × (JSON + .file payload)
  const keys = await waitForIntegrityRevisions(prefix, 4)
  expect(keys.filter(k => !k.endsWith('.file')).length).toBe(2)
  await waitForFlagCleared(dataset.id)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  // the newest revision reflects the actual user who made the patch (origin: 'user'), not the
  // generic worker/propagation fallback
  const revisions = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(revisions.results[0].origin).toBe('user')
  expect(revisions.results[0].operation).toBe('update')
})

test('a permissions change historizes a new revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await admin.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['list', 'read'] }])

  expect((await waitForIntegrityRevisions(prefix, 4)).filter(k => !k.endsWith('.file')).length).toBe(2)
  await waitForFlagCleared(dataset.id)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
})

// CRITICAL 1 regression: stampHistorizeMany used to be called AFTER the destructive propagation
// write (topics.ts $pull), so its filter ('topics.id': id) matched nothing post-mutation and the
// removal silently never historized. The fix moves the stamp before the mutation.
test('a topic removed from owner settings historizes a new revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const topicId = `integrity-topic-${Date.now()}`
  const existingTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  // add our topic alongside whatever topics already exist (avoid clobbering unrelated test state)
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: [...existingTopics, { id: topicId, title: 'Integrity topic' }] })

  // topics is a covered field: assigning it to the dataset is itself a legitimate PATCH that historizes
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { topics: [{ id: topicId, title: 'Integrity topic' }] })
  expect((await waitForIntegrityRevisions(prefix, 4)).filter(k => !k.endsWith('.file')).length).toBe(2)
  await waitForFlagCleared(dataset.id)

  // renaming the topic in settings propagates the display name, but topics are hashed as ids only
  // (D1 simplification) — a rename is NOT a covered change and must not re-anchor
  const beforeRename = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', {
    topics: beforeRename.map((t: any) => t.id === topicId ? { ...t, title: 'Renamed integrity topic' } : t)
  })
  await waitForFlagCleared(dataset.id)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(2) // unchanged: rename is not covered

  // now remove the topic from the owner settings — this fires the propagation $pull on the dataset
  const settingsBeforeRemoval = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: settingsBeforeRemoval.filter((t: any) => t.id !== topicId) })

  await waitForFlagCleared(dataset.id)
  const keys = await waitForIntegrityRevisions(prefix, 6)
  expect(keys.filter(k => !k.endsWith('.file')).length).toBe(3)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
})

// CRITICAL 1 regression: same self-invalidated-filter bug in deletePublicationSite's stampHistorizeMany
// (called after the $pull, whose filter matched the very element the pull just removed).
test('deleting a publication site historizes a new revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const siteId = `integrity-site-${Date.now()}`
  await admin.post('/api/v1/settings/user/test_superadmin/publication-sites', { type: 'data-fair-portals', id: siteId, url: 'http://portal.example.test' })

  // publicationSites is a covered field: assigning it to the dataset is itself a legitimate PATCH
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [`data-fair-portals:${siteId}`] })
  expect((await waitForIntegrityRevisions(prefix, 4)).filter(k => !k.endsWith('.file')).length).toBe(2)
  await waitForFlagCleared(dataset.id)

  // deleting the publication site fires the propagation $pull on the dataset
  await admin.delete(`/api/v1/settings/user/test_superadmin/publication-sites/data-fair-portals/${siteId}`)

  await waitForFlagCleared(dataset.id)
  const keys = await waitForIntegrityRevisions(prefix, 6)
  expect(keys.filter(k => !k.endsWith('.file')).length).toBe(3)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
})

// Regression: updateTopics must diff old vs new — every settings save (even an unrelated
// single-key PATCH) flows through it with old == new, and blanket re-anchoring would silently
// legitimize a not-yet-detected out-of-band tamper (this healed the dev breach fixtures once).
test('a settings write with unchanged topics does not re-anchor tagged datasets', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const topicId = `integrity-topic-same-${Date.now()}`
  const existingTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: [...existingTopics, { id: topicId, title: 'Unchanged topic' }] })
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { topics: [{ id: topicId, title: 'Unchanged topic' }] })
  await waitForIntegrityRevisions(prefix, 4)
  await waitForFlagCleared(dataset.id)

  // tamper out-of-band, then save settings with the SAME topics: the propagation must NOT
  // stamp/re-anchor (that would legitimize the tamper before it was ever detected)
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered before unrelated settings save' })
  const settingsTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: settingsTopics })
  await new Promise(resolve => setTimeout(resolve, 2000)) // settle: give a wrongly-stamped relay time to run
  expect((await getRawDataset(dataset.id))._needsHistorizing).toBeUndefined()
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(2)
  // and the tamper is still detectable
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
})

test('owner transfer is refused while integrity is active', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await expect(admin.put(`/api/v1/datasets/${dataset.id}/owner`, { type: 'organization', id: 'test_org1', name: 'Test Org 1' }))
    .rejects.toMatchObject({ status: 400 })

  // disabling integrity unblocks the transfer
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })
  const res = await admin.put(`/api/v1/datasets/${dataset.id}/owner`, { type: 'organization', id: 'test_org1', name: 'Test Org 1' })
  expect(res.status).toBe(200)
})
