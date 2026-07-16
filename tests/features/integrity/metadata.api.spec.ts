// tests/features/integrity/metadata.api.spec.ts
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, collectNotifications, getRawDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions, waitForFlagCleared } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const prefixes = (dataset: any) => ({
  file: `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`,
  metadata: `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
})

test('enable anchors both classes; check is ok for both', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.file, 1)
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('ok')
  expect(check.metadata.status).toBe('ok')
})

test('an out-of-band covered-field write breaches metadata while file stays ok, and _fix reconciles', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const notif = await collectNotifications()
  // test-env patch-dataset is a RAW mongo write with no outbox stamp — the exact tamper we detect
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered out-of-band' })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('breach')
  expect(check.file.status).toBe('ok')
  const events = await notif.waitForCount(1)
  expect(events.some((e: any) => e.topic?.key?.includes('integrity-breach'))).toBe(true)

  // operator accepts the current doc as legitimate → _fix re-anchors it (metadata revision 1)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForIntegrityRevisions(p.metadata, 2)
  await waitForFlagCleared(dataset.id)
  const after = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(after.metadata.status).toBe('ok')
})

test('an out-of-band write to an EXCLUDED field neither breaches nor creates a revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  // status / count / errorStatus are denylisted operational fields: raw writes are expected there
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { status: 'error', errorStatus: 'oops', count: 999 })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
  expect((await listIntegrityKeys(p.metadata)).length).toBe(1)
})

test('a legitimate metadata PATCH historizes a new metadata revision (and only that)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  const fileCountBefore = (await listIntegrityKeys(p.file)).length

  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'legitimate new description' })

  const keys = await waitForIntegrityRevisions(p.metadata, 2)
  expect(keys.length).toBe(2)
  // a metadata-only patch must not re-anchor the file class
  expect((await listIntegrityKeys(p.file)).length).toBe(fileCountBefore)
  // and the check stays clean
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')

  // the revision's originator must reflect the actual user who made the patch (defaulted from
  // patch.updatedBy in applyPatch), not the generic 'worker:historize' fallback
  await waitForFlagCleared(dataset.id)
  const revisions = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`, { params: { class: 'metadata' } })).data
  expect(revisions.results[0].originator).toMatch(/^user:/)
  expect(revisions.results[0].originator).not.toBe('worker:historize')
})

test('a permissions change historizes a new metadata revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)

  await admin.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['list', 'read'] }])

  expect((await waitForIntegrityRevisions(p.metadata, 2)).length).toBe(2)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
})

// CRITICAL 1 regression: stampHistorizeMany used to be called AFTER the destructive propagation
// write (topics.ts $pull), so its filter ('topics.id': id) matched nothing post-mutation and the
// removal silently never historized. The fix moves the stamp before the mutation.
test('a topic removed from owner settings historizes a new metadata revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const topicId = `integrity-topic-${Date.now()}`
  const existingTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  // add our topic alongside whatever topics already exist (avoid clobbering unrelated test state)
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: [...existingTopics, { id: topicId, title: 'Integrity topic' }] })

  // topics is a covered field: assigning it to the dataset is itself a legitimate PATCH that historizes
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { topics: [{ id: topicId, title: 'Integrity topic' }] })
  expect((await waitForIntegrityRevisions(p.metadata, 2)).length).toBe(2)
  await waitForFlagCleared(dataset.id)

  // now remove the topic from the owner settings — this fires the propagation $pull on the dataset
  const settingsBeforeRemoval = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: settingsBeforeRemoval.filter((t: any) => t.id !== topicId) })

  await waitForFlagCleared(dataset.id)
  const keys = await waitForIntegrityRevisions(p.metadata, 3)
  expect(keys.length).toBe(3)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
})

// CRITICAL 1 regression: same self-invalidated-filter bug in deletePublicationSite's stampHistorizeMany
// (called after the $pull, whose filter matched the very element the pull just removed).
test('deleting a publication site historizes a new metadata revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const siteId = `integrity-site-${Date.now()}`
  await admin.post('/api/v1/settings/user/test_superadmin/publication-sites', { type: 'data-fair-portals', id: siteId, url: 'http://portal.example.test' })

  // publicationSites is a covered field: assigning it to the dataset is itself a legitimate PATCH
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [`data-fair-portals:${siteId}`] })
  expect((await waitForIntegrityRevisions(p.metadata, 2)).length).toBe(2)
  await waitForFlagCleared(dataset.id)

  // deleting the publication site fires the propagation $pull on the dataset
  await admin.delete(`/api/v1/settings/user/test_superadmin/publication-sites/data-fair-portals/${siteId}`)

  await waitForFlagCleared(dataset.id)
  const keys = await waitForIntegrityRevisions(p.metadata, 3)
  expect(keys.length).toBe(3)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
})

// Regression: updateTopics must diff old vs new — every settings save (even an unrelated
// single-key PATCH) flows through it with old == new, and blanket re-anchoring would silently
// legitimize a not-yet-detected out-of-band tamper (this healed the dev breach fixtures once).
test('a settings write with unchanged topics does not re-anchor tagged datasets', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const topicId = `integrity-topic-same-${Date.now()}`
  const existingTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: [...existingTopics, { id: topicId, title: 'Unchanged topic' }] })
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { topics: [{ id: topicId, title: 'Unchanged topic' }] })
  await waitForIntegrityRevisions(p.metadata, 2)
  await waitForFlagCleared(dataset.id)

  // tamper out-of-band, then save settings with the SAME topics: the propagation must NOT
  // stamp/re-anchor (that would legitimize the tamper before it was ever detected)
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered before unrelated settings save' })
  const settingsTopics = (await admin.get('/api/v1/settings/user/test_superadmin')).data.topics ?? []
  await admin.patch('/api/v1/settings/user/test_superadmin', { topics: settingsTopics })
  await new Promise(resolve => setTimeout(resolve, 2000)) // settle: give a wrongly-stamped relay time to run
  expect((await getRawDataset(dataset.id))._needsHistorizing).toBeUndefined()
  expect((await listIntegrityKeys(p.metadata)).length).toBe(2)
  // and the tamper is still detectable
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('breach')
})

test('_fix re-anchors then refreshes the verdict itself, no manual check needed', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered for the fix flow' })
  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.metadata.status).toBe('breach')

  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  // the relay re-anchors, then (fixIntegrity context) runs the check itself: the verdict
  // refreshes to ok in the background, with no manual _check call
  const start = Date.now()
  let status: string | undefined
  while (Date.now() - start < 20000) {
    status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.metadata?.lastCheck?.status
    if (status === 'ok') break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  expect(status).toBe('ok')
  const revisions = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`, { params: { class: 'metadata' } })).data
  expect(revisions.results[0].operation).toBe('fixIntegrity')
})
