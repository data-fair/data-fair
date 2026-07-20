// tests/features/integrity/lines.api.spec.ts
// Target 3: per-line locked revisions for editable (REST) datasets — store layout, write-path
// stamping, relay, enable/gate, check, restore/fix.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, integrityTestStore } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('delimiter listing keeps the joint anchor blind to the lines subtree', async () => {
  const store = integrityTestStore
  const prefix = `data-fair/test-delim/${Date.now()}/`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  const context = { operation: 'create' as const, origin: 'worker' as const, date: new Date().toISOString() }
  await store.writeRevision(`${prefix}000000000`, { hash: { sha256: 'meta' }, context, dataset: { id: 'ds' } }, retainUntil)
  await store.writeRevision(`${prefix}lines/l1/0000000000000001-abc`, {
    hash: { sha256: 'abc' }, context, dataset: { id: 'ds' }, line: { _id: 'l1', _i: 1 }, payload: { a: 1 }
  }, retainUntil)

  const all = (await store.listRevisions(prefix)).map(r => r.key)
  expect(all).toHaveLength(2)
  const topOnly = (await store.listRevisions(prefix, { delimiter: '/' })).map(r => r.key)
  expect(topOnly).toEqual([`${prefix}000000000`])
  const linesOnly = (await store.listRevisions(`${prefix}lines/`)).map(r => r.key)
  expect(linesOnly).toEqual([`${prefix}lines/l1/0000000000000001-abc`])
})

const restDataset = async (ax: any, lines: Array<Record<string, any>>) => {
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity lines ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset = res.data
  if (lines.length) await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, lines.map((l, i) => ({ _id: `line${i}`, ...l })))
  return dataset
}

const rawLine = async (ax: any, datasetId: string, lineId: string) =>
  (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-find-one/${datasetId}`, { params: { filter: JSON.stringify({ _id: lineId }) } })).data

test('line writes stamp _needsHistorizing and the dataset hint when integrity is active', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  // enroll raw (API enable for REST lands in a later task)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  // patch-dataset does not bump updatedAt, so drop the read-cache to force a fresh mongo read
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)

  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'b', attr2: 2 })
  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line._needsHistorizing?.context?.origin).toBe('superadmin')
  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw._needsHistorizingLines).toBe(true)
})

test('line writes do NOT stamp when integrity is inactive', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'b', attr2: 2 })
  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line._needsHistorizing).toBeUndefined()
})

test('deleteAllLines and drop bulk are refused while integrity is active', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await expect(ax.delete(`/api/v1/datasets/${dataset.id}/lines`)).rejects.toMatchObject({ status: 400 })
  await expect(ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines?drop=true`, [{ _id: 'x', attr1: 'c' }]))
    .rejects.toMatchObject({ status: 400 })
})
