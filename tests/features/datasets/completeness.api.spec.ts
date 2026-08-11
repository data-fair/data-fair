import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

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
})
