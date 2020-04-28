const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

it('Create REST dataset and define specific projection', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: 'a rest dataset with geo data',
    schema: [
      { key: 'x', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordX' },
      { key: 'y', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordY' }
    ]
  })
  assert.equal(res.status, 201)
  const dataset = res.data
  await workers.hook(`indexer/${dataset.id}`)
  res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { x: 610336, y: 2132685 })
  assert.equal(res.status, 201)
  try {
    await workers.hook(`indexer/${dataset.id}`)
  } catch (err) { }
  await ax.patch(`/api/v1/datasets/${dataset.id}`, {
    projection: {
      title: 'NTF (Paris) / Lambert zone II',
      code: 'EPSG:27572'
    }
  })
  await workers.hook(`finalizer/${dataset.id}`)
  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'x,y,_geopoint' } })
  assert.ok(res.data.results[0]._geopoint)
  assert.ok(res.data.results[0]._geopoint.startsWith('46.19'))
})
