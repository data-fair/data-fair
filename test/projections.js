const assert = require('assert').strict

const workers = require('../server/workers')

describe('projections', () => {
  it('Create REST dataset and apply specific projection to simple coords', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest projection',
      schema: [
        { key: 'x', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordX' },
        { key: 'y', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordY' }
      ]
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    await workers.hook(`finalizer/${dataset.id}`)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      projection: {
        title: 'NTF (Paris) / Lambert zone II',
        code: 'EPSG:27572'
      }
    })
    await workers.hook(`finalizer/${dataset.id}`)

    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { x: 610336, y: 2132685 })
    assert.equal(res.status, 201)
    await workers.hook(`finalizer/${dataset.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'x,y,_geopoint' } })
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geopoint.startsWith('46.19'))
  })

  it('Create REST dataset and apply specific projection to geometries', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest projection',
      schema: [
        { key: 'g', type: 'string', 'x-refersTo': 'http://data.ign.fr/def/geometrie#Geometry' }
      ]
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    await workers.hook(`finalizer/${dataset.id}`)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      projection: {
        title: 'NTF (Paris) / Lambert zone II',
        code: 'EPSG:27572'
      }
    })
    await workers.hook(`finalizer/${dataset.id}`)

    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, {
      g: JSON.stringify({ type: 'LineString', coordinates: [[610336, 2132685], [610346, 2132695]] })
    })
    assert.equal(res.status, 201)
    await workers.hook(`finalizer/${dataset.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'g,_geopoint' } })
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geopoint.startsWith('46.19'))
  })
})
