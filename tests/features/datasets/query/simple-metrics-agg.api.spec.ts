import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')

// dataset mixing a geometry column (mapped without doc_values in ES) with regular columns —
// the shape that used to make the default fields list blow up with "all shards failed"
const geoSetup = async (id: string) => {
  await ax.post('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema: [
      { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' },
      { key: 'longueur', type: 'number' },
      { key: 'label', type: 'string' }
    ]
  })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [
    { geom: JSON.stringify({ type: 'Point', coordinates: [-2.40, 47.89] }), longueur: 10, label: 'a' },
    { geom: JSON.stringify({ type: 'Point', coordinates: [-2.41, 47.87] }), longueur: 20, label: 'b' }
  ])
  await waitForFinalize(ax, id)
}

test.describe('simple_metrics_agg hardening', () => {
  test.beforeEach(async () => { await clean() })

  test('default fields list skips the geometry column instead of failing', async () => {
    await geoSetup('sma-geo')
    const res = await ax.get('/api/v1/datasets/sma-geo/simple_metrics_agg')
    assert.equal(res.data.total, 2)
    assert.ok(res.data.metrics.longueur)
    assert.equal(res.data.metrics.longueur.min, 10)
    assert.equal(res.data.metrics.longueur.max, 20)
    assert.equal(res.data.metrics.geom, undefined)
  })

  test('the misused singular field param is ignored and the query still succeeds', async () => {
    await geoSetup('sma-field')
    const res = await ax.get('/api/v1/datasets/sma-field/simple_metrics_agg', { params: { field: 'longueur' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.metrics.longueur)
  })

  test('explicitly requesting the geometry column → 400, not an ES failure', async () => {
    await geoSetup('sma-geo-explicit')
    await assert.rejects(ax.get('/api/v1/datasets/sma-geo-explicit/simple_metrics_agg', { params: { fields: 'geom' } }),
      (e: any) => e.status === 400)
  })

  test('unknown column in fields → 400', async () => {
    await geoSetup('sma-unknown')
    await assert.rejects(ax.get('/api/v1/datasets/sma-unknown/simple_metrics_agg', { params: { fields: 'nope' } }),
      (e: any) => e.status === 400)
  })

  test('unknown metric name → 400', async () => {
    await geoSetup('sma-bad-metric')
    await assert.rejects(ax.get('/api/v1/datasets/sma-bad-metric/simple_metrics_agg', { params: { metrics: 'nope' } }),
      (e: any) => e.status === 400)
  })

  test('metric_agg on the geometry column → 400, not an ES failure', async () => {
    await geoSetup('sma-metric-agg-geo')
    await assert.rejects(ax.get('/api/v1/datasets/sma-metric-agg-geo/metric_agg', { params: { metric: 'cardinality', field: 'geom' } }),
      (e: any) => e.status === 400)
  })

  test('explicit metrics narrow the default fields list instead of failing on other columns', async () => {
    await geoSetup('sma-avg')
    const res = await ax.get('/api/v1/datasets/sma-avg/simple_metrics_agg', { params: { metrics: 'avg' } })
    assert.equal(res.data.metrics.longueur.avg, 15)
    assert.equal(res.data.metrics.label, undefined)
  })
})

test.describe('simple_metrics_agg truncated-values warning', () => {
  test.beforeEach(async () => { await clean() })

  test('metrics on a column that dropped > 200-char values attach a readable hint', async () => {
    const long = 'L'.repeat(260)
    await ax.post('/api/v1/datasets/sma-trunc', {
      isRest: true,
      title: 'sma-trunc',
      schema: [{ key: 'plain', type: 'string' }, { key: 'n', type: 'number' }]
    })
    await ax.post('/api/v1/datasets/sma-trunc/_bulk_lines', [
      { plain: 'short', n: 1 },
      { plain: long, n: 2 }
    ])
    await waitForFinalize(ax, 'sma-trunc')

    const res = await ax.get('/api/v1/datasets/sma-trunc/simple_metrics_agg')
    assert.ok(typeof res.data.hint === 'string' && res.data.hint.includes('plain'), `expected a hint mentioning "plain", got: ${res.data.hint}`)
    // the metrics themselves are still returned
    assert.equal(res.data.metrics.n.max, 2)
  })

  test('no hint when no column dropped values', async () => {
    await ax.post('/api/v1/datasets/sma-no-trunc', {
      isRest: true,
      title: 'sma-no-trunc',
      schema: [{ key: 'plain', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/sma-no-trunc/_bulk_lines', [{ plain: 'short' }])
    await waitForFinalize(ax, 'sma-no-trunc')
    const res = await ax.get('/api/v1/datasets/sma-no-trunc/simple_metrics_agg')
    assert.equal(res.data.hint, undefined)
  })
})
