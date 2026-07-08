import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, anonymousAx, clean } from '../../support/axios.ts'
import { sendDataset, getRawDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions, waitForFlagCleared } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
// reset test-owned datasets + limit counters before each test (the shared suite convention); the
// integrity specs all run as the single test_superadmin, so without this their datasets accumulate
// and hit the dev nbDatasets quota. clean() spares dev_fixtures (owner.id !~ /^test_/).
test.beforeEach(async () => { await clean() })

test('superadmin enable writes the initial anchor; non-admin is forbidden', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`

  await expect(user.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 403 })

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await waitForIntegrityRevisions(prefix, 1)).length).toBe(1)
  const metaPrefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
  expect((await waitForIntegrityRevisions(metaPrefix, 1)).length).toBe(1)
  // the S3 write for a class happens before the relay's single trailing mongo update (which sets
  // integrity.<cls>.lastRevision for every anchored class AND unsets _needsHistorizing together) —
  // wait for that update too before reading integrity.file.lastRevision below
  await waitForFlagCleared(dataset.id)

  const status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(status.active).toBe(true)
  expect(status.file.lastRevision.hash.md5).toBe(dataset.originalFile.md5)
})

test('enable is rejected on a dataset without an md5 file', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  // a REST dataset has no originalFile.md5
  const ds = (await admin.post('/api/v1/datasets', { isRest: true, title: 'rest-int', schema: [{ key: 'a', type: 'string' }] })).data
  await expect(admin.put(`/api/v1/datasets/${ds.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 400 })
})

test('_fix on an unchanged file dedupes (no spurious revision)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await waitForIntegrityRevisions(prefix, 1)).length).toBe(1)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForFlagCleared(dataset.id)
  // unchanged file → dedupe → still exactly one revision
  expect((await listIntegrityKeys(prefix)).length).toBe(1)
})

test('revisions endpoint lists revisions newest-first and is readable by the owner admin', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  const metaPrefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  await waitForIntegrityRevisions(metaPrefix, 1) // enable stamps both classes; wait for both anchors
  // a _fix on the unchanged file dedupes, so tamper then _fix to get a 2nd revision
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForIntegrityRevisions(prefix, 2)

  // enable stamped both classes (1 file + 1 metadata anchor), then tamper+_fix adds 1 file
  // re-anchor (the metadata _fix dedupes, the metadata doc did not change) → 3 total
  const res = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(res.count).toBe(3)
  expect(res.results.length).toBe(3)
  // newest first: dates non-increasing (indexes are per-class, so compare on date instead)
  expect(new Date(res.results[0].date).getTime()).toBeGreaterThanOrEqual(new Date(res.results[1].date).getTime())
  expect(res.results[0]).toHaveProperty('class')
  expect(res.results[0]).toHaveProperty('hash')
  expect(res.results[0]).toHaveProperty('operation')
  expect(res.results[0]).toHaveProperty('date')
  expect(res.results[0]).toHaveProperty('originator')

  // pagination
  const page1 = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`, { params: { size: 1, page: 1 } })).data
  expect(page1.count).toBe(3)
  expect(page1.results.length).toBe(1)
  expect(page1.results[0].i).toBe(res.results[0].i)

  // the personal owner (admin of the owner account) can read the revisions
  expect((await user.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data.count).toBe(3)
})

test('integrity reads are allowed to the owner admin, writes stay superadmin-only', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const owner = await axiosAuth('test_superadmin@test.com', undefined, false) // same user = personal owner, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  const metaPrefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  await waitForIntegrityRevisions(metaPrefix, 1) // enable stamps both classes; wait for both anchors

  // owner (admin of the owner account) can read status and revisions
  expect((await owner.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.active).toBe(true)
  // enable stamps both classes → 1 file + 1 metadata anchor
  expect((await owner.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data.count).toBe(2)
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
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
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
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  const metaPrefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  await waitForIntegrityRevisions(metaPrefix, 1) // enable stamps both classes; wait for both anchors
  await waitForFlagCleared(dataset.id) // ensure the relay's trailing mongo update has landed too
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.file.status).toBe('breach')

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })

  const status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(status.active).toBe(false)
  expect(status.file?.lastCheck).toBeUndefined()
  // no longer surfaced under the error filter
  const list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  expect(list.results.find((d: any) => d.id === dataset.id)).toBeUndefined()
})

test('internal historize fields are stripped from API responses', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  // set only the _needsHistorizing.context (no .classes → the relay filter '_needsHistorizing.classes.0'
  // never matches, so the relay never picks it up and the doc stays stable)
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    _needsHistorizing: { context: { operation: 'enable', originator: 'user:secret' } }
  })
  // patch-dataset does not bump updatedAt, so drop the read-cache to force a fresh mongo read
  await admin.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  const body = (await admin.get(`/api/v1/datasets/${dataset.id}`)).data
  expect(body._needsHistorizing).toBeUndefined()
  // the raw doc still has it (proves the response filter did the stripping)
  const raw = await getRawDataset(dataset.id)
  expect(raw._needsHistorizing).toBeTruthy()
})

test('breached dataset appears under the status=error listing without changing its status', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  const metaPrefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  await waitForIntegrityRevisions(metaPrefix, 1) // enable stamps both classes; wait for both anchors
  await waitForFlagCleared(dataset.id) // ensure the relay's trailing mongo update has landed too

  // not in error before the breach
  let list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  expect(list.results.find((d: any) => d.id === dataset.id)).toBeUndefined()

  // tamper + check → breach
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('breach')

  // now it appears under status=error, but its real status is unchanged (finalized)
  list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  const row = list.results.find((d: any) => d.id === dataset.id)
  expect(row).toBeTruthy()
  expect(row.status).toBe('finalized')
  expect(row.integrity.file.lastCheck.status).toBe('breach')
})
