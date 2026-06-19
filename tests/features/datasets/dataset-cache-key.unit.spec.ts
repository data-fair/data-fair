import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getDatasetCacheKey } from '../../../api/src/datasets/operations.ts'

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
