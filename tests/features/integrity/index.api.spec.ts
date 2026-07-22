// tests/features/integrity/index.api.spec.ts
// A1: index-consistency verdict — the ES projection users read (through the alias) is compared
// against the verified source. REST datasets here; file datasets in the same file, Task 5.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForLinesDrained, waitForFlagCleared, aimSeedAt, aimSeedAway } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const WINDOWS = 8 // config.integrity.index.windows default

// enrolled REST dataset with 3 lines, relay drained, indexed and refreshed — ready to check
const enrolledRestDataset = async (ax: any) => {
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity index ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset = res.data
  await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
    { _id: 'line0', attr1: 'a', attr2: 1 },
    { _id: 'line1', attr1: 'b', attr2: 2 },
    { _id: 'line2', attr1: 'c', attr2: 3 }
  ])
  await waitForFinalize(ax, dataset.id)
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(ax, dataset.id)
  await waitForFlagCleared(dataset.id)
  await waitForFinalize(ax, dataset.id).catch(() => {}) // backfill may re-run indexing
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  return dataset
}

const lineI = async (ax: any, datasetId: string, lineId: string): Promise<number> => {
  const line = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-find-one/${datasetId}`,
    { params: { filter: JSON.stringify({ _id: lineId }) } })).data
  return line._i
}

const lineIBounds = async (ax: any, datasetId: string, ids: string[]): Promise<{ min: number, max: number }> => {
  const is = await Promise.all(ids.map(id => lineI(ax, datasetId, id)))
  return { min: Math.min(...is), max: Math.max(...is) }
}

test('clean REST dataset gets an ok index verdict with matching counts', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect(check.index?.status).toBe('ok')
  expect(check.index?.count).toEqual({ expected: 3, actual: 3 })
  expect(check.index?.checked).toBeGreaterThan(0)
})

test('an out-of-band ES edit inside a sampled window is a breach with evidence', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'es-tampered'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAt(target, min, max, WINDOWS)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('index')
  expect(check.index?.status).toBe('diverged')
  const edited = check.index!.sample.find((s: any) => s.kind === 'edited')
  expect(edited?.key).toBe('line0')
  expect(edited?.actual).toContain('es-tampered')
  expect(edited?.expected).toContain('"attr1":"a"')
  // evidence is persisted on the dataset doc BEFORE any repair (the reindex destroys it live)
  const state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastCheck?.index?.sample?.[0]?.kind).toBeTruthy()
})

test('an ES delete outside every sampled window is still caught by the count check', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, delete: true
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAway(target, min, max, WINDOWS)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.breach).toContain('index')
  expect(check.index?.status).toBe('diverged')
  expect(check.index?.count).toEqual({ expected: 3, actual: 2 })
})

test('a surplus ES doc is flagged (count + window intersection)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  const { max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    insert: { _i: max + 1000, attr1: 'ghost', attr2: 99 }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.breach).toContain('index')
  expect(check.index?.count).toEqual({ expected: 3, actual: 4 })
})

test('pending indexing downgrades the index verdict to unknown, other verdicts unaffected', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  // simulate a line awaiting the index task (out-of-band flag: no relay hint, no real write)
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { _needsIndexing: true } }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.index?.status).toBe('unknown')
  expect(check.breach ?? []).not.toContain('index')
})

// enrolled file dataset (dataset1.csv), relay drained, indexed and refreshed — ready to check
const enrolledFileDataset = async (ax: any) => {
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  return (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
}

test('clean file dataset gets an ok index verdict', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledFileDataset(ax)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect(check.index?.status).toBe('ok')
  expect(check.index?.count?.expected).toBe(dataset.count)
  expect(check.index?.checked).toBeGreaterThan(0)
})

test('an out-of-band ES edit on a file dataset row is a breach (window aimed by _i)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledFileDataset(ax)
  // tamper the first row (_i is the join key for file datasets)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _i: 1 } }, script: "ctx._source.id = 'es-tampered'"
  })
  const seed = aimSeedAt(1, 1, dataset.count, WINDOWS) // pivot ≤ 1 ⇒ covers row 1
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.breach).toContain('index')
  const edited = check.index!.sample.find((s: any) => s.kind === 'edited')
  expect(edited?.key).toBe('1')
  expect(edited?.actual).toContain('es-tampered')
})

test('deep=true catches a tamper the sampled windows miss', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'deep-tampered'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const away = aimSeedAway(target, min, max, WINDOWS)
  // sampled pass with an away seed: the edit is invisible (count unchanged by an edit)
  const sampled = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed: away })).data
  expect(sampled.index?.status).toBe('ok')
  // deep pass: exhaustive lockstep — no seed can hide it
  const deep = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check?deep=true`)).data
  expect(deep.breach).toContain('index')
  expect(deep.index!.sample.find((s: any) => s.kind === 'edited')?.key).toBe('line0')
})

test('a diverted alias pointing at a doctored index copy is a breach', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-divert-alias/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'diverted'"
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check?deep=true`)).data
  expect(check.breach).toContain('index')
})

test('index reindex action journals the evidence, repairs, and the next check is ok', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'repair-me'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAt(target, min, max, WINDOWS)
  const breach = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(breach.breach).toContain('index')

  await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/index/_reindex`, { reason: 'test repair' })
  // the evidence survives the repair in the journal
  const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
  const evt = journal.find((e: any) => e.type === 'integrity-index-repair')
  expect(evt).toBeTruthy()
  expect(evt.data).toContain('repair-me')
  expect(evt.data).toContain('test repair')

  await waitForFinalize(ax, dataset.id)
  // the reindex's finalize pass re-stamps _needsHistorizing (integrity-active dataset, standard
  // outbox); the async historize task must drain it before a check reads a converged verdict
  // instead of the pending 'unknown'
  await waitForFlagCleared(dataset.id)
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  const recheck = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(recheck.index?.status).toBe('ok')
  expect(recheck.status).toBe('ok')
})
