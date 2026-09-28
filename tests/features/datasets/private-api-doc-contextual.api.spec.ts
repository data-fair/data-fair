import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const owner = await axiosAuth('test_user1@test.com')      // owns datasets in personal account
const contrib = await axiosAuth('test_user5@test.com')
const admin = await axiosAuth('test_superadmin@test.com', undefined, true) // admin mode bypasses the filter

const pathsOf = async (ax: any, id: string, query = '') => {
  const doc = (await ax.get(`/api/v1/datasets/${id}/private-api-docs.json${query}`)).data
  return Object.keys(doc.paths)
}

/** The "Par où commencer ?" section alone — the rest of the description mentions routes too. */
const guideOf = async (ax: any, id: string) => {
  const { description } = (await ax.get(`/api/v1/datasets/${id}/private-api-docs.json`)).data.info
  const start = description.indexOf('**Par où commencer ?**')
  return start === -1 ? '' : description.slice(start)
}

test.describe('private-api-docs contextual to permissions', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => { if (testInfo.status === 'passed') await checkPendingTasks() })

  test('contrib without bulkLines does not see _bulk_lines, but sees createLine', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-1' })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: ['list', 'read', 'readAdvanced'], operations: ['createLine', 'updateLine', 'writeData', 'writeDescription'] }
    ])
    const paths = await pathsOf(contrib, ds.id)
    assert.ok(!paths.includes('/_bulk_lines'), 'bulk_lines must be filtered out')
    assert.ok(paths.includes('/lines'), 'createLine endpoint must be present')
  })

  test('contrib with the write class sees _bulk_lines', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-2' })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: ['list', 'read', 'readAdvanced', 'write'] }
    ])
    const paths = await pathsOf(contrib, ds.id)
    assert.ok(paths.includes('/_bulk_lines'), 'bulk_lines must be present with the write class')
  })

  test('admin mode bypasses the filter and lists every operation', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-admin' })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: ['list', 'read', 'readAdvanced'], operations: ['createLine'] }
    ])
    const filtered = await pathsOf(contrib, ds.id)
    assert.ok(!filtered.includes('/_bulk_lines'), 'bulk_lines must be filtered out for a limited contrib')
    const full = await pathsOf(admin, ds.id)
    assert.ok(full.includes('/_bulk_lines'), 'bulk_lines must be present in admin mode')
  })

  test('public api-docs.json is unchanged (not filtered)', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-5' })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: ['list', 'read'] }
    ])
    const doc = (await contrib.get(`/api/v1/datasets/${ds.id}/api-docs.json`)).data
    assert.equal(doc.openapi, '3.1.0')
  })

  // The guide is appended after the contextual filter, so it can only cite surviving routes.
  // Pointing a restricted caller at /lines would send them straight into a 403.
  test('the getting started guide only cites operations the caller may call', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-guide', schema: [{ key: 'ville', type: 'string' }] })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: ['list'], operations: ['readDescription', 'readSchema', 'getValuesAgg', 'readPrivateApiDoc'] }
    ])

    const ownerGuide = await guideOf(owner, ds.id)
    assert.ok(ownerGuide.includes('/lines'), 'the owner keeps /lines, so the guide must show it')

    const paths = await pathsOf(contrib, ds.id)
    assert.ok(!paths.includes('/lines'), 'precondition: /lines is filtered out for this contrib')
    const contribGuide = await guideOf(contrib, ds.id)
    assert.ok(contribGuide.length, 'the contrib still has enough operations for a guide')
    assert.ok(!contribGuide.includes('/lines'), 'the guide must not cite the filtered out /lines')
    assert.ok(contribGuide.includes('/values_agg'), 'the guide must still cite the granted /values_agg')
  })

  test('the guide is dropped when almost everything is filtered out', async () => {
    const { data: ds } = await owner.post('/api/v1/datasets', { isRest: true, title: 'ctx-doc-guide-empty', schema: [{ key: 'ville', type: 'string' }] })
    await owner.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { type: 'user', id: 'test_user5', classes: [], operations: ['readDescription', 'readPrivateApiDoc'] }
    ])
    assert.equal(await guideOf(contrib, ds.id), '', 'a single bullet orients nobody')
  })
})
