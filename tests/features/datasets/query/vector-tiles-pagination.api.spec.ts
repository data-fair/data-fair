import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const countFeatures = (data: ArrayBuffer) => new VectorTile(new Protobuf(data)).layers.results.length

test.describe('vector tiles - sampling=max pagination', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    await setConfig('elasticsearch.maxPageSize', 10000)
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('pages beyond maxPageSize by default, an explicit size caps the tile', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/vt-pages', {
      isRest: true,
      title: 'vt-pages',
      schema: [{ key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry', 'x-capabilities': { vtPrepare: true } }]
    })
    await ax.post('/api/v1/datasets/vt-pages/_bulk_lines', Array.from({ length: 30 }, (_, i) => ({
      geom: JSON.stringify({ type: 'Point', coordinates: [2 + i / 10, 48] })
    })))
    await waitForFinalize(ax, 'vt-pages')

    // tiny pages so that a few lines exercise the search_after loop
    await setConfig('elasticsearch.maxPageSize', 5)
    const getTile = (params = {}) => ax.get('/api/v1/datasets/vt-pages/lines', {
      params: { format: 'pbf', xyz: '0,0,0', ...params },
      responseType: 'arraybuffer'
    })

    let res = await getTile()
    assert.equal(res.headers['x-tilesmode'], 'es/max/prepared')
    assert.equal(countFeatures(res.data), 25, 'default size pages up to 5 pages of maxPageSize')

    res = await getTile({ size: 3 })
    assert.equal(countFeatures(res.data), 3, 'explicit size is a total cap')
  })
})
