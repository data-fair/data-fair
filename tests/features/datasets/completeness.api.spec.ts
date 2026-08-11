import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForFinalize, getRawDataset } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')
/** The same user with test_org1 as active account, to read what has been transferred to it. */
const u1Org1 = await axiosAuth('test_user1@test.com', 'test_org1')

const activate = (metadataCompleteness: any = { active: true }) =>
  u1.patch('/api/v1/settings/user/test_user1', { metadataCompleteness })

test.describe('dataset metadata completeness', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('no score at all while the feature is off', async () => {
    const id = 'completeness-off'
    const created = await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    assert.equal(created.data.completeness, undefined)
    const patched = await u1.patch('/api/v1/datasets/' + id, { description: 'd'.repeat(200) })
    assert.equal(patched.data.completeness, undefined)
  })

  test('a dataset created while active is scored at creation', async () => {
    await activate()
    const id = 'completeness-on'
    const created = await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    assert.equal(created.data.completeness.score, 0)
    assert.deepEqual(created.data.completeness.missing, ['description', 'summary', 'license', 'origin'])
  })

  test('patching a scored field recomputes, and it survives a fresh GET', async () => {
    await activate()
    const id = 'completeness-patch'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    const patched = await u1.patch('/api/v1/datasets/' + id, { description: 'd'.repeat(200) })
    // description = 4 points of 11 applicable => 36
    assert.equal(patched.data.completeness.score, 36)
    assert.deepEqual(patched.data.completeness.missing, ['summary', 'license', 'origin'])

    const fetched = await u1.get('/api/v1/datasets/' + id)
    assert.equal(fetched.data.completeness.score, 36)
  })

  test('filling every unconditional criterion reaches 100', async () => {
    await activate()
    const id = 'completeness-full'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    const patched = await u1.patch('/api/v1/datasets/' + id, {
      description: 'd'.repeat(200),
      summary: 's'.repeat(100),
      license: { title: 'ODbL', href: 'https://example.com/odbl' },
      origin: 'https://example.com'
    })
    assert.equal(patched.data.completeness.score, 100)
    assert.deepEqual(patched.data.completeness.missing, [])
  })

  test('the score is read-only: patching it directly is rejected', async () => {
    await activate()
    const id = 'completeness-readonly'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await assert.rejects(
      u1.patch('/api/v1/datasets/' + id, { completeness: { score: 100, missing: [] } }),
      { status: 400 }
    )
  })

  test('a configuration with no applicable weight stores no score rather than a 0 % nobody can raise', async () => {
    // refused at save time, so a dataset never ends up displaying a bar it cannot explain
    await assert.rejects(
      activate({ active: true, weights: { description: 0, summary: 0, license: 0, origin: 0 } }),
      { status: 400 }
    )
  })

  test('a length window no text could satisfy is refused', async () => {
    await assert.rejects(activate({ active: true, description: { min: 500, max: 200 } }), { status: 400 })
  })

  test('a cleared length floor still requires the description to be there', async () => {
    await activate({ active: true, description: { min: 0 }, weights: { summary: 0, license: 0, origin: 0 } })
    const id = 'completeness-min-zero'
    const created = await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    assert.equal(created.data.completeness.score, 0)
    assert.deepEqual(created.data.completeness.missing, ['description'])
    // and a single character now fills it, which is what clearing the floor is for
    const patched = await u1.patch('/api/v1/datasets/' + id, { description: 'd' })
    assert.equal(patched.data.completeness.score, 100)
  })

  test('the score does not survive a change of owner, whose settings it was scaled on', async () => {
    await activate()
    const id = 'completeness-transfer'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.patch('/api/v1/datasets/' + id, { description: 'd'.repeat(200) })
    assert.equal((await u1.get('/api/v1/datasets/' + id)).data.completeness.score, 36)

    // the organization never enabled the feature: the field goes away rather than keeping a
    // percentage computed on the previous owner's weights
    await u1.put('/api/v1/datasets/' + id + '/owner', { type: 'organization', id: 'test_org1', name: 'Test Org 1' })
    assert.equal((await u1Org1.get('/api/v1/datasets/' + id)).data.completeness, undefined)
  })

  test('the score of a dataset with an open draft describes the published metadata', async () => {
    await activate()
    const dataset = await sendDataset('datasets/dataset1.csv', u1)
    await u1.patch('/api/v1/datasets/' + dataset.id, { description: 'd'.repeat(200) })
    const published = (await getRawDataset(dataset.id)).completeness
    assert.equal(published.score, 36)

    // Uploading a replacement file opens a file-updated draft: the patch carries `draftReason`
    // while the document does not hold it yet, and every one of its keys is about to be prefixed
    // 'draft.'. The shortened description below belongs to the draft only — scoring it would both
    // lower the published dataset's percentage for metadata nobody published, and file the result
    // under `draft.completeness`, which no settings opt-out ever clears.
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('body', JSON.stringify({ description: 'd'.repeat(50) }))
    // `draft=never` keeps the draft open instead of auto-validating it, so its subtree is readable
    await u1.put('/api/v1/datasets/' + dataset.id, form,
      { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: 'never' } })
    await waitForFinalize(u1, dataset.id)

    const draft = await getRawDataset(dataset.id)
    assert.equal(draft.draft.draftReason.key, 'file-updated')
    assert.equal(draft.draft.description.length, 50)
    assert.equal(draft.draft.completeness, undefined)
    assert.deepEqual(draft.completeness, published)

    // and validating the draft publishes the short description, which then does lower the score
    await u1.post('/api/v1/datasets/' + dataset.id + '/draft')
    const deadline = Date.now() + 15000
    let validated = await getRawDataset(dataset.id)
    while (validated.draft && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
      validated = await getRawDataset(dataset.id)
    }
    assert.equal(validated.draft, undefined)
    assert.equal(validated.completeness.score, 0)
    assert.ok(validated.completeness.missing.includes('description'))
  })

  test('a transfer into an owner that has the feature on scores on that owner settings', async () => {
    // only the description counts for the organization, so the same dataset reaches 100 there
    await u1Org1.patch('/api/v1/settings/organization/test_org1', {
      metadataCompleteness: { active: true, weights: { summary: 0, license: 0, origin: 0 } }
    })
    await activate()
    const id = 'completeness-transfer-on'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.patch('/api/v1/datasets/' + id, { description: 'd'.repeat(200) })
    assert.equal((await u1.get('/api/v1/datasets/' + id)).data.completeness.score, 36)

    await u1.put('/api/v1/datasets/' + id + '/owner', { type: 'organization', id: 'test_org1', name: 'Test Org 1' })
    assert.equal((await u1Org1.get('/api/v1/datasets/' + id)).data.completeness.score, 100)
  })
})
