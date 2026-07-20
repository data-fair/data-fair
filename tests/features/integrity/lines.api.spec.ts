// tests/features/integrity/lines.api.spec.ts
// Target 3: per-line locked revisions for editable (REST) datasets — store layout, write-path
// stamping, relay, enable/gate, check, restore/fix.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, integrityTestStore } from '../../support/integrity.ts'
import { waitForFinalize } from '../../support/workers.ts'

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

  const postRes = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'b', attr2: 2 })
  expect(postRes.data._needsHistorizing).toBeUndefined()
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

test('history revisions do not expose the _needsHistorizing stamp', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity lines history ${Date.now()}`,
    rest: { history: true },
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset = res.data
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'h1', attr1: 'x', attr2: 1 })
  const revisions = (await ax.get(`/api/v1/datasets/${dataset.id}/lines/h1/revisions`)).data
  for (const rev of revisions.results) expect(rev._needsHistorizing).toBeUndefined()

  // initial-fill path: history enabled AFTER lines already carry stamps
  const res2 = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity lines history fill ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset2 = res2.data
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset2.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await ax.post(`/api/v1/datasets/${dataset2.id}/lines`, { _id: 'h1', attr1: 'x', attr2: 1 })
  // enabling history triggers configureHistory's initial fill from the stamped live lines
  await ax.patch(`/api/v1/datasets/${dataset2.id}`, { rest: { history: true } })
  const revisions2 = (await ax.get(`/api/v1/datasets/${dataset2.id}/lines/h1/revisions`)).data
  for (const rev of revisions2.results) expect(rev._needsHistorizing).toBeUndefined()
})

const waitForLinesDrained = async (ax: any, datasetId: string, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${datasetId}`)).data
    if (!raw._needsHistorizingLines) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('timed out waiting for _needsHistorizingLines to clear')
}

test('the lines relay ships a revision per stamped line and clears the flags', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'l1', attr1: 'hello', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)

  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys).toHaveLength(1)
  const rev = await integrityTestStore.getRevision(keys[0])
  expect((rev as any).payload).toMatchObject({ attr1: 'hello', attr2: 1 })
  expect((rev as any).line._id).toBe('l1')
  const line = await rawLine(ax, dataset.id, 'l1')
  expect(line._needsHistorizing).toBeUndefined()
})

test('a deleted line ships a tombstone revision and the doc is purged after both flags clear', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'l1', attr1: 'x', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)
  await ax.delete(`/api/v1/datasets/${dataset.id}/lines/l1`)
  await waitForLinesDrained(ax, dataset.id)

  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys.some(k => k.endsWith('-deleted'))).toBe(true)
  // once indexing AND historization both committed, the tombstone doc is purged
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const count = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-count/${dataset.id}`, { params: { filter: JSON.stringify({ _id: 'l1' }) } })).data.count
    if (count === 0) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const count = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-count/${dataset.id}`, { params: { filter: JSON.stringify({ _id: 'l1' }) } })).data.count
  expect(count).toBe(0)
})

test('enable on a REST dataset backfills every live line and GET reports progress', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  // wait for initial indexing to settle before enabling (polls status via the journal instead of a fixed sleep)
  await waitForFinalize(ax, dataset.id)
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(ax, dataset.id)

  const integrity = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(integrity.active).toBe(true)
  expect(integrity.lines).toMatchObject({ anchored: 2, pending: 0 })
  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys).toHaveLength(2)
  const rev = await integrityTestStore.getRevision(keys[0])
  expect((rev as any).context.operation).toBe('enable')
})

test('enable is refused above the lines gate', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await ax.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.lines.maxLines', value: 0 })
  try {
    await expect(ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true }))
      .rejects.toMatchObject({ status: 409 })
  } finally {
    await ax.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.lines.maxLines', value: 100000 })
  }
})

// ---------------------------------------------------------------------------------------------
// checker: lines verdict (target 3) — the three out-of-band tamper shapes + the pending guard
// ---------------------------------------------------------------------------------------------

const enableAndDrain = async (ax: any, datasetId: string) => {
  await ax.put(`/api/v1/datasets/${datasetId}/_integrity`, { active: true })
  await waitForLinesDrained(ax, datasetId)
}

test('check reports the three line tamper shapes and heals via the transaction path', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  let check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  // 1. out-of-band content edit (no _hash/_i touch — the silent-edit blind spot the fold had)
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered' } }
  })
  // 2. out-of-band insert
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'ghost' }, update: { $set: { attr1: 'ghost', _i: 1, _updatedAt: new Date().toISOString() } }, upsert: true
  })
  // 3. out-of-band delete
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-delete-one/${dataset.id}`, { filter: { _id: 'line1' } })

  check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('lines')
  expect(check.lines.diverged).toBe(3)
  expect(check.lines.sample.sort()).toEqual(['ghost', 'line0', 'line1'])
})

test('a check on a dataset with undrained line stamps reports unknown, never a false ok', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  // simulate a dataset stuck with an undrained lines hint (e.g. status 'error') without any real
  // pending line — the guard must fail safe rather than report 'ok' against a possibly-stale view
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizingLines: true })
  try {
    const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
    expect(check.status).toBe('unknown')
  } finally {
    await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { $unset: { _needsHistorizingLines: '' } })
  }
})
