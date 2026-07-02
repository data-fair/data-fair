import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { nextLinkHref, linkHeaderValue, buildJsonBody, buildGeojsonBody } from '../../../api/src/datasets/routes/lines-body.ts'

// Pure, config-free body/link builders: no NODE_CONFIG_DIR trickery needed here — that is the point.
test.describe('lines-body (pure)', () => {
  test('buildJsonBody splices byte-identically to JSON.stringify of the equivalent object', () => {
    const head = { total: 2, next: 'http://x/lines?after=1' }
    const rows = [JSON.stringify({ a: 1 }), JSON.stringify({ a: 2 })]
    assert.equal(buildJsonBody(head, rows), JSON.stringify({ ...head, results: [{ a: 1 }, { a: 2 }] }))
    assert.equal(buildJsonBody({}, []), '{"results":[]}')
  })

  test('nextLinkHref: only on a full page, drops the page param, serializes the sort cursor', () => {
    const ctx = { size: 2, query: { size: '2', page: '3', sort: '_id' }, publicBaseUrl: 'http://public', datasetId: 'ds' }
    const href = nextLinkHref(ctx, 2, { sort: ['00001', 7] })
    assert.ok(href!.startsWith('http://public/api/v1/datasets/ds/lines?'))
    const url = new URL(href!)
    assert.equal(url.searchParams.get('page'), null)
    assert.equal(url.searchParams.get('after'), '"00001",7')
    assert.equal(nextLinkHref(ctx, 1, { sort: [1] }), undefined) // partial page → no next
    assert.equal(linkHeaderValue('http://x/y'), '<http://x/y>; rel=next')
  })

  test('buildGeojsonBody matches JSON.stringify key order (type, total?, features, bbox?)', () => {
    const feat = { type: 'Feature', id: 'a', geometry: null, properties: { _id: 'a' } }
    assert.equal(
      buildGeojsonBody(1, [JSON.stringify(feat)], [0, 0, 1, 1]),
      JSON.stringify({ type: 'FeatureCollection', total: 1, features: [feat], bbox: [0, 0, 1, 1] })
    )
    assert.equal(buildGeojsonBody(undefined, [], undefined), '{"type":"FeatureCollection","features":[]}')
  })
})
