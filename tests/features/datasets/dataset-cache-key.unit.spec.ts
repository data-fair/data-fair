import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getDatasetCacheKey, datasetFreshnessProjection, isCachedDatasetFresh } from '../../../api/src/datasets/operations.ts'

const siteA = { owner: { type: 'organization', id: 'orgA' }, type: 'data-fair-portals', id: 'portalA' }
const siteB = { owner: { type: 'organization', id: 'orgB' }, type: 'data-fair-portals', id: 'portalB' }

// the args mirror getDataset(datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, db, ...)
const args = (publicationSite: any, mainPublicationSite: any, opts: { useDraft?: boolean, datasetId?: string } = {}) =>
  [opts.datasetId ?? 'my-dataset', publicationSite, mainPublicationSite, opts.useDraft ?? false, false, false, {}, undefined, undefined]

test.describe('getDatasetCacheKey', () => {
  test('identical args produce identical keys', () => {
    assert.equal(getDatasetCacheKey(args(siteA, undefined)), getDatasetCacheKey(args(siteA, undefined)))
  })

  test('different publication sites must not collide (the [object Object] bug)', () => {
    assert.notEqual(getDatasetCacheKey(args(siteA, undefined)), getDatasetCacheKey(args(siteB, undefined)))
  })

  test('a publicationSite and a mainPublicationSite carrying the same site do not collide', () => {
    assert.notEqual(getDatasetCacheKey(args(siteA, undefined)), getDatasetCacheKey(args(undefined, siteA)))
  })

  test('the absence of a publication site is distinct from any site', () => {
    assert.notEqual(getDatasetCacheKey(args(undefined, undefined)), getDatasetCacheKey(args(siteA, undefined)))
  })

  test('the other primitive args still discriminate the key', () => {
    assert.notEqual(getDatasetCacheKey(args(siteA, undefined, { useDraft: true })), getDatasetCacheKey(args(siteA, undefined, { useDraft: false })))
    assert.notEqual(getDatasetCacheKey(args(siteA, undefined, { datasetId: 'other' })), getDatasetCacheKey(args(siteA, undefined)))
  })
})

// The freshness probe behind getDatasetFresh: which document changes are allowed to keep serving
// the 30s-memoized copy, and which must force a full re-read.
test.describe('isCachedDatasetFresh', () => {
  const base = () => ({
    updatedAt: '2026-08-01T10:00:00.000Z',
    finalizedAt: '2026-08-01T10:00:05.000Z',
    status: 'finalized',
    integrity: { lastCheck: { date: '2026-08-06T09:00:00.000Z' }, lastRevision: { date: '2026-08-05T08:00:00.000Z' } }
  })

  test('an unchanged document may be served from the cache', () => {
    assert.equal(isCachedDatasetFresh(base(), base()), true)
  })

  test('a missing cached document is never fresh', () => {
    assert.equal(isCachedDatasetFresh(undefined, base()), false)
  })

  for (const [field, mutate] of [
    ['updatedAt', (d: any) => { d.updatedAt = '2026-08-02T10:00:00.000Z' }],
    ['finalizedAt', (d: any) => { d.finalizedAt = '2026-08-02T10:00:00.000Z' }],
    ['status', (d: any) => { d.status = 'error' }],
    ['errorStatus', (d: any) => { d.errorStatus = 'indexed' }],
    ['errorRetry', (d: any) => { d.errorRetry = '2026-08-02T10:00:00.000Z' }]
  ] as [string, (d: any) => void][]) {
    test(`a change of ${field} forces a re-read`, () => {
      const fresh = base()
      mutate(fresh)
      assert.equal(isCachedDatasetFresh(base(), fresh), false)
    })
  }

  // the reason this probe exists in its current shape: an integrity check writes its verdict
  // without touching updatedAt (that field is the dataset's user-facing modification date, and a
  // nightly check must not move it), so before these two comparisons a "check now" kept serving
  // the previous verdict for the whole cache window, page reloads included
  test('a fresh integrity verdict forces a re-read even though nothing else moved', () => {
    const fresh = base()
    fresh.integrity.lastCheck.date = '2026-08-06T09:30:00.000Z'
    assert.equal(isCachedDatasetFresh(base(), fresh), false)
  })

  test('a newly written anchor forces a re-read even though nothing else moved', () => {
    const fresh = base()
    fresh.integrity.lastRevision.date = '2026-08-06T09:30:00.000Z'
    assert.equal(isCachedDatasetFresh(base(), fresh), false)
  })

  test('enrolling a dataset (integrity appearing) forces a re-read', () => {
    const cached: any = base()
    delete cached.integrity
    assert.equal(isCachedDatasetFresh(cached, base()), false)
  })

  test('a dataset with no integrity at all stays cacheable', () => {
    const cached: any = base()
    const fresh: any = base()
    delete cached.integrity
    delete fresh.integrity
    assert.equal(isCachedDatasetFresh(cached, fresh), true)
  })

  test('draft.updatedAt only counts when reading in draft mode', () => {
    const fresh: any = base()
    fresh.draft = { updatedAt: '2026-08-06T09:30:00.000Z' }
    assert.equal(isCachedDatasetFresh(base(), fresh), true)
    assert.equal(isCachedDatasetFresh(base(), fresh, true), false)
  })
})

test('datasetFreshnessProjection projects draft.updatedAt only in draft mode', () => {
  assert.equal('draft.updatedAt' in datasetFreshnessProjection(), false)
  assert.equal(datasetFreshnessProjection(true)['draft.updatedAt'], 1)
  // the integrity fields are the point of the projection — see isCachedDatasetFresh above
  assert.equal(datasetFreshnessProjection()['integrity.lastCheck.date'], 1)
  assert.equal(datasetFreshnessProjection()['integrity.lastRevision.date'], 1)
})
