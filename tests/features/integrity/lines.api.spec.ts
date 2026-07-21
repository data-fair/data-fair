// tests/features/integrity/lines.api.spec.ts
// Target 3: per-line locked revisions for editable (REST) datasets — store layout, write-path
// stamping, relay, enable/gate, check, restore/fix.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, integrityTestStore, waitForLinesDrained, waitForFlagCleared } from '../../support/integrity.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('delimiter listing keeps the joint anchor blind to the lines subtree', async () => {
  const store = integrityTestStore
  const prefix = `data-fair/test-delim/${Date.now()}/`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  const context = { operation: 'create' as const, origin: 'worker' as const, date: new Date().toISOString() }
  await store.writeRevision(`${prefix}000000000`, { hash: { metadata: 'meta' }, context, dataset: { id: 'ds' } }, retainUntil)
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

const enableAndDrain = async (ax: any, datasetId: string) => {
  await ax.put(`/api/v1/datasets/${datasetId}/_integrity`, { active: true })
  await waitForLinesDrained(ax, datasetId)
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
  // the internal backfill-pending flag must never leak through the cleaned public dataset
  // response, even while the backfill is still in flight
  const midBackfill = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
  expect(midBackfill._needsHistorizingLines).toBeUndefined()
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
// truth-grounding refusals: a guarantee is never claimed over content the snapshot cannot cover
// ---------------------------------------------------------------------------------------------

test('enable is refused on a rest dataset with line ownership', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    rest: { lineOwnership: true },
    title: `integrity lines owner ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }]
  })
  await waitForFinalize(ax, res.data.id)
  // _owner/_ownerName live outside cleanedLineBody: undetectable AND dropped by restore/_fix's
  // bless — enrolling would advertise a guarantee the mechanism cannot honour
  await expect(ax.put(`/api/v1/datasets/${res.data.id}/_integrity`, { active: true }))
    .rejects.toMatchObject({ status: 400 })
  const state = (await ax.get(`/api/v1/datasets/${res.data.id}/_integrity`)).data
  expect(state.active).toBeFalsy()
})

test('enable is refused on a dataset with an attachments field', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity lines attachments ${Date.now()}`,
    schema: [
      { key: 'attr1', type: 'string' },
      { key: 'doc', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
    ]
  })
  await waitForFinalize(ax, res.data.id)
  // attachment bytes are not covered by the snapshot: an 'ok' verdict would overstate coverage
  await expect(ax.put(`/api/v1/datasets/${res.data.id}/_integrity`, { active: true }))
    .rejects.toMatchObject({ status: 400 })
})

test('line ownership and attachment fields cannot be acquired while integrity is active', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  await expect(ax.patch(`/api/v1/datasets/${dataset.id}`, { rest: { lineOwnership: true } }))
    .rejects.toMatchObject({ status: 400 })
  await expect(ax.patch(`/api/v1/datasets/${dataset.id}`, {
    schema: [
      { key: 'attr1', type: 'string' },
      { key: 'attr2', type: 'integer' },
      { key: 'doc', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
    ]
  })).rejects.toMatchObject({ status: 400 })

  // and the guarantee is intact: the refusals left the dataset untouched
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
})

// ---------------------------------------------------------------------------------------------
// checker: lines verdict (target 3) — the three out-of-band tamper shapes + the pending guard
// ---------------------------------------------------------------------------------------------

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

test('lines restore heals all three tamper shapes and returns a fresh ok verdict', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered' } }
  })
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'ghost' }, update: { $set: { attr1: 'ghost', _i: 1, _updatedAt: new Date().toISOString() } }, upsert: true
  })
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-delete-one/${dataset.id}`, { filter: { _id: 'line1' } })

  const verdict = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/lines/_restore`, { reason: 'test remediation' })).data
  expect(verdict.status).toBe('ok')
  // hot state healed: content back, ghost gone, deleted line re-inserted
  const line0 = await rawLine(ax, dataset.id, 'line0')
  expect(line0.attr1).toBe('a')
  // the restore's delete transaction soft-deletes ghost immediately (verdict above already
  // reflects that: compareDatasetLines only counts live, non-deleted docs). The physical purge of
  // the tombstone doc is driven by the async indexing worker (same lifecycle as any REST delete,
  // see 'a deleted line ships a tombstone revision...' above) — poll rather than assume it is
  // synchronous with the restore response.
  let ghost
  const start = Date.now()
  while (Date.now() - start < 15000) {
    ghost = await rawLine(ax, dataset.id, 'ghost')
    if (!ghost) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  expect(ghost).toBeFalsy()
  const line1 = await rawLine(ax, dataset.id, 'line1')
  expect(line1.attr1).toBe('b')
})

test('_fix blesses the current tampered state as the new anchored truth', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'legitimate-oob-edit' } }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  const verdict = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`, { reason: 'known migration' })).data
  expect(verdict.status).toBe('ok')
  const line0 = await rawLine(ax, dataset.id, 'line0')
  expect(line0.attr1).toBe('legitimate-oob-edit')
})

test('_fix deterministically blesses content whose sha256 sorts adversely against the stale anchor', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  // A raw out-of-band content edit leaves `_i` untouched, so the stale anchor and the fresh
  // bless both land at the SAME `_i`. sha256(stableStringify({attr1:'a',attr2:1})) (the original,
  // still-anchored content) is 5184d5e0efa40fd77121931b69a9269c011d9049110e77d6e1a3334c8bf04606;
  // sha256(stableStringify({attr1:'tampered-x',attr2:1})) is
  // 5e823ce884bb336dc8f0779d7459f78ae7939ac4503a3c7d71885e3a717c2642 — lexically GREATER. A
  // `_fix` that anchors the bless directly at the line's current `_i` (rather than through the
  // transaction pipeline) writes a second same-`_i` key that LIST returns AFTER the original, so
  // `latestLineAnchors`'s equal-`i` tie-break (`parsed.i > current.i`, strict) keeps the
  // lexically-first — here the STALE, pre-tamper — anchor as "latest": the bless is silently
  // lost and a follow-up check still reports a breach against the tampered live content.
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered-x' } }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  const verdict = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`, { reason: 'adverse-order regression' })).data
  expect(verdict.status).toBe('ok')
  const line0 = await rawLine(ax, dataset.id, 'line0')
  expect(line0.attr1).toBe('tampered-x')

  // the blessed anchor must be deterministically latest, not just accepted by _fix's own
  // inline verdict — a follow-up, independent check must also read ok
  const recheck = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(recheck.status).toBe('ok')
})

// ---------------------------------------------------------------------------------------------
// per-line revision history and diff endpoints (target 3, read side)
// ---------------------------------------------------------------------------------------------

test('per-line revision history lists newest-first and serves the payload diff', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'v1', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'v2', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)

  const history = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions`)).data
  expect(history.count).toBe(2)
  expect(history.results[0].hasPayload).toBe(true)
  expect(history.results[0].i).toBeGreaterThan(history.results[1].i)

  const detail = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions/${history.results[1].i}`)).data
  expect(detail.payload).toMatchObject({ attr1: 'v1' })
  expect(detail.current).toMatchObject({ attr1: 'v2' })
})

// ---------------------------------------------------------------------------------------------
// per-line lock renewal (§3.4 Option B, exhaustive per §3.5): the sliding lock that keeps every
// line's repairability alive — a missed renewal loses it permanently at lock expiry
// ---------------------------------------------------------------------------------------------

const linesAnchorKeys = async (ax: any, datasetId: string) => {
  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${datasetId}`)).data
  return (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${datasetId}/lines/`)).map(r => r.key)
}

test('a due lines horizon renews every live line anchor on a passing check', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  const keys = await linesAnchorKeys(ax, dataset.id)
  expect(keys).toHaveLength(2)
  const before = await integrityTestStore.getRetention(keys[0])

  // make the lines horizon look due (retention is 1 day in test config, renewal interval 1/12 →
  // anything under ~22h remaining is due)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    'integrity.linesRenewal.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString()
  })

  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  const state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.linesRenewal.status).toBe('ok')
  expect(state.linesRenewal.renewed).toBe(2) // exhaustive: every live line, not a sample
  expect(state.linesRenewal.failed).toBe(0)
  // the real S3 lock advanced, not merely the mongo mirror
  const after = await integrityTestStore.getRetention(keys[0])
  expect(after!.getTime()).toBeGreaterThan(before!.getTime())
})

test('a fresh lines horizon is not renewed, and a breach skips lines renewal entirely', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  // fresh horizon: nothing due
  const first = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(first.status).toBe('ok')
  let state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.linesRenewal.renewed).toBeUndefined() // untouched enable-time baseline

  // due + tampered: renewal must not slide a lock over state we just failed to verify
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    'integrity.linesRenewal.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString()
  })
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered' } }
  })
  const breach = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(breach.status).toBe('breach')
  state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.linesRenewal.renewed).toBeUndefined() // verify-then-renew: no renewal on breach
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

// ---------------------------------------------------------------------------------------------
// covered-content propagation writers: line rewrites driven by legitimate dataset patches must
// keep the anchors in sync (stamped), and derived columns must stay out of the covered body
// ---------------------------------------------------------------------------------------------

test('a legitimate schema patch removing a property re-anchors the rewritten lines (no false breach)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 7 }])
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)
  expect((await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('ok')

  // narrowing patch: attr2 leaves the schema → applyPatch $unsets it from every line — a
  // covered-content rewrite that must be stamped (hint first) or every line reads 'edited'
  await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: [{ key: 'attr1', type: 'string' }] })
  await waitForFinalize(ax, dataset.id)
  await waitForLinesDrained(ax, dataset.id)
  await waitForFlagCleared(dataset.id)

  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line.attr2).toBeUndefined()
  expect(line._needsHistorizing).toBeUndefined()
  expect((await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('ok')
})

test('exprEval extension outputs stay outside the covered line body', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity lines expr ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }],
    extensions: [{ active: true, type: 'exprEval', expr: 'attr2 * 2', property: { key: 'double', type: 'integer' } }]
  })
  const dataset = res.data
  await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { _id: 'l1', attr1: 'a', attr2: 2 })
  await waitForFinalize(ax, dataset.id)
  await enableAndDrain(ax, dataset.id)

  // the extender rewrites its computed column out-of-pipeline (no stamp): change the expression
  // so it recomputes every line — the covered body must not shift
  await ax.patch(`/api/v1/datasets/${dataset.id}`, {
    extensions: [{ active: true, type: 'exprEval', expr: 'attr2 * 3', property: { key: 'double', type: 'integer' } }]
  })
  // the recompute runs through the extension-updater worker: poll the raw line
  let line: any
  const start = Date.now()
  while (Date.now() - start < 15000) {
    line = await rawLine(ax, dataset.id, 'l1')
    if (line?.double === 6) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  expect(line.double).toBe(6)
  // M5: the extender's write-back must NOT stamp — its columns are outside the covered body,
  // so stamping would only churn pointless re-anchors on every recompute
  expect(line._needsHistorizing).toBeUndefined()
  await waitForFlagCleared(dataset.id)
  await waitForLinesDrained(ax, dataset.id)
  expect((await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('ok')

  // the locked payload never carries the derived column
  const list = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/l1/revisions`)).data
  const detail = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity/lines/l1/revisions/${list.results[0].i}`)).data
  expect(detail.payload.attr2).toBe(2)
  expect(detail.payload.double).toBeUndefined()
})

// M2 (target-3 review): disable must not leave per-line stamp residue behind
test('disable clears per-line stamp residue', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await waitForFinalize(ax, dataset.id)
  // enroll raw and stamp a line WITHOUT setting the dataset hint: the relay never drains it,
  // so the residue is deterministic
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { _needsHistorizing: { context: { operation: 'update', origin: 'user' } } } }
  })

  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })
  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line._needsHistorizing).toBeUndefined()
})
