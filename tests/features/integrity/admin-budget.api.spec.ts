// Synchronous admin actions past their budget answer 202 {status:'running'} and finish in-process
// (design 2026-10-15 §4). integrity.running is display-only and dropped once the lock is gone.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, anonymousAx, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, waitForLinesDrained } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })
test.afterEach(async () => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.adminSyncBudgetMs', value: 20000 })
})

const enrolledRest = async (ax: any) => {
  const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: `budget ${Date.now()}`, schema: [{ key: 'attr1', type: 'string' }] })).data
  await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ _id: 'l1', attr1: 'a' }, { _id: 'l2', attr1: 'b' }])
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(dataset.id)
  return dataset
}

const waitNotRunning = async (ax: any, datasetId: string, since: string, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = (await ax.get(`/api/v1/datasets/${datasetId}/_integrity`)).data
    if (!state.running && state.lastCheck?.date && state.lastCheck.date > since) return state
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('admin action did not converge')
}

test('a check past its budget answers 202 running, then converges', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.adminSyncBudgetMs', value: 1 })
  const since = new Date().toISOString()
  const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
  expect(res.status).toBe(202)
  expect(res.data).toEqual({ status: 'running' })
  const state = await waitNotRunning(ax, dataset.id, since)
  expect(state.lastCheck.status).toBe('ok')
})

test('a check within budget still answers 200 with the verdict', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
  expect(res.status).toBe(200)
  expect(res.data.status).toBe('ok')
})

test('running without a held lock is dropped (pod died mid-action)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.running': { action: 'fix', startedAt: new Date().toISOString() } })
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  const state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.running).toBeUndefined()
})
