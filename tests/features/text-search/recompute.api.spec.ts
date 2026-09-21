import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl, mockAppUrl } from '../../support/axios.ts'
import { callWorkerFunction, getRawDataset, getRawApplication, patchRawDataset } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('deferred search-index recompute', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // NOTE: `GET /api/v1/datasets?q=` now matches through `_terms`, not through mongo's legacy $text
  // index, so staleness IS observable from the API. This file still asserts on the raw document
  // fields instead, on purpose: it is the worker's contract that is under test here (rebuild
  // _terms/_pos/_len, stamp _searchIndex, clear the flag), and only the raw document can assert the
  // recompute reproduces the inline index EXACTLY. The query path is covered by
  // search-behaviour.api.spec.ts and catalog-search.api.spec.ts.
  test('a document marked stale is reindexed by the worker and the flag is cleared', async () => {
    await metaOnly('rc-eolienne', { title: 'Parc eolien de Bretagne' })
    const indexed = await getRawDataset('rc-eolienne')
    assert.ok(indexed._terms.length > 0, 'inline indexing should have populated _terms')
    assert.equal(indexed._needsSearchIndex, undefined)

    // simulate a bulk write that changed indexed content without recomputing: the index is stale
    // and the document declares it, exactly as markStale() would
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/rc-eolienne`, {
      _terms: [], _pos: {}, _len: {}, _needsSearchIndex: true
    })
    const stale = await getRawDataset('rc-eolienne')
    assert.equal(stale._terms.length, 0, 'the simulated bulk write must clear the index')
    assert.equal(stale._needsSearchIndex, true)

    await callWorkerFunction('shortProcessor', 'computeDatasetSearchIndex', stale)

    const drained = await getRawDataset('rc-eolienne')
    assert.equal(drained._needsSearchIndex, undefined, 'the flag must be cleared')
    assert.ok(drained._terms.length > 0, 'the worker must rebuild the index')
    assert.deepEqual(drained._terms, indexed._terms, 'recompute must reproduce the original inline index')
  })

  test('a stale application is reindexed by the worker and the flag is cleared', async () => {
    const { data: created } = await u1.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Application eolienne' })
    const indexed = await getRawApplication(created.id)
    assert.ok(indexed._terms.length > 0, 'inline indexing should have populated _terms')
    assert.ok(indexed._terms.includes('eolien'), '"eolienne" must be stemmed to "eolien"')
    assert.equal(indexed._needsSearchIndex, undefined)

    // simulate a bulk write that changed indexed content without recomputing: the index is stale
    // and the document declares it, exactly as markStale() would
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-application/${created.id}`, {
      _terms: [], _pos: {}, _len: {}, _needsSearchIndex: true
    })
    const stale = await getRawApplication(created.id)
    assert.equal(stale._terms.length, 0, 'the simulated bulk write must clear the index')
    assert.equal(stale._needsSearchIndex, true)

    await callWorkerFunction('shortProcessor', 'computeApplicationSearchIndex', stale)

    const drained = await getRawApplication(created.id)
    assert.equal(drained._needsSearchIndex, undefined, 'the flag must be cleared')
    assert.ok(drained._terms.includes('eolien'), 'the worker must rebuild the index with the expected stem')
    assert.deepEqual(drained._terms, indexed._terms, 'recompute must reproduce the original inline index')
  })

  // workers/index.ts merges a pending draft into the resource before dispatching ANY task
  // (mergeDraft = Object.assign(dataset, dataset.draft)), and the index describes the PUBLISHED
  // dataset. Reachable whenever a stale-flagged dataset has a draft in flight while the draft's own
  // task sits on a saturated worker: this shortProcessor task is still selectable then.
  test('the recompute indexes the published dataset, not a draft merged in by the dispatcher', async () => {
    await metaOnly('rc-draft', { title: 'Parc eolien de Bretagne' })
    const published = await getRawDataset('rc-draft')
    assert.ok(published._terms.includes('eolien'), 'inline indexing should have indexed the published title')

    // a draft in flight carrying content that must never reach the published index, plus the stale
    // flag a bulk write would have left. draft.status 'validated' with no draft file matches no
    // pipeline task, so the real worker loop leaves this dataset alone.
    await patchRawDataset('rc-draft', {
      draft: {
        status: 'validated',
        draftReason: { key: 'file-updated', message: 'nouveau fichier', validationMode: 'never' },
        title: 'Hydrolienne experimentale',
        schema: [{ key: 'brouillon', type: 'string', title: 'Colonne brouillon' }]
      },
      _terms: [],
      _pos: {},
      _len: {},
      _needsSearchIndex: true
    })

    // exactly what the dispatcher hands to the task: the draft overlaid on the published document,
    // with the draft object itself removed
    const raw = await getRawDataset('rc-draft')
    const asDispatched = { ...raw, ...raw.draft }
    delete asDispatched.draft
    assert.equal(asDispatched.title, 'Hydrolienne experimentale')
    assert.ok(asDispatched.draftReason, 'the dispatched resource must carry the draftReason')

    await callWorkerFunction('shortProcessor', 'computeDatasetSearchIndex', asDispatched)

    const drained = await getRawDataset('rc-draft')
    assert.equal(drained._needsSearchIndex, undefined, 'the flag must be cleared')
    assert.ok(drained._terms.includes('eolien'), 'the published title must be indexed')
    assert.ok(!drained._terms.includes('hydrolien'), 'no draft title in the published index: ' + JSON.stringify(drained._terms))
    assert.ok(!drained._terms.includes('brouillon'), 'no draft column label in the published index: ' + JSON.stringify(drained._terms))
    assert.equal(drained.title, 'Parc eolien de Bretagne', 'the recompute must not write draft content back to the published document')
  })

  // this task's predicate is the only one a failure does not clear: an error escaping to the generic
  // worker handler flags an otherwise healthy resource 'error' (from a task that writes no journal
  // by design, and that has no errorRetry at all on the applications side) AND leaves the flag set,
  // so loop() re-selects it immediately, forever.
  test('a failing recompute clears the flag instead of erroring the resource and looping', async () => {
    await metaOnly('rc-broken', { title: 'Parc eolien de Normandie' })
    const indexed = await getRawDataset('rc-broken')
    assert.ok(indexed._terms.includes('eolien'))

    // a document the recompute cannot process (schema is not an array, so computeSearchText throws):
    // stands in for the real failures — BSON size overflow, an analyzer key rejection, a mongo error
    await patchRawDataset('rc-broken', { schema: 'not-a-schema', _needsSearchIndex: true })

    const asDispatched = await getRawDataset('rc-broken')
    // must not reject: a rejection here is what reaches the generic error handler in production
    await callWorkerFunction('shortProcessor', 'computeDatasetSearchIndex', asDispatched)

    const drained = await getRawDataset('rc-broken')
    assert.equal(drained._needsSearchIndex, undefined, 'the flag must be cleared even on failure, or the task is re-selected forever')
    assert.deepEqual(drained._terms, indexed._terms, 'a failed recompute leaves the previous index in place')
    assert.notEqual(drained.status, 'error', 'bookkeeping must not error an otherwise healthy dataset')

    // restore a sane schema so the shared test environment is not left with a broken document
    await patchRawDataset('rc-broken', { schema: indexed.schema ?? [] })
  })
})
