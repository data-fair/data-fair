import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

describe('geo files support', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process uploaded geojson dataset', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('analyzeGeojson/' + res.data.id)
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.schema.length, 8)
    const idField = dataset.schema.find((field: any) => field.key === 'id')
    assert.equal(idField.type, 'string')
    const descField = dataset.schema.find((field: any) => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find((field: any) => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')
    const intField = dataset.schema.find((field: any) => field.key === 'int')
    assert.equal(intField.type, 'integer')
    assert.ok(dataset.schema.find((field: any) => field.key === 'objp1'))
    assert.ok(dataset.schema.find((field: any) => field.key === 'objp2'))

    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0]._geopoint, '0.5,103.5')
    assert.equal(lines[0]._geocorners, undefined)
    assert.equal(lines[0]._geoshape, undefined)
    assert.equal(lines[0].int, 0)
    assert.equal(lines[0].objp1, 'p 1')
    assert.equal(lines[0].objp2, 'p 2')
    assert.equal(lines[1].int, 2)
    assert.equal(lines[2].int, undefined)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.features.length, 3)
    const feature = geojson.features[0]
    assert.equal(feature.properties._i, 1)
    assert.equal(feature.properties.bool, true)

    const wkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })).data
    assert.ok(wkt.startsWith('GEOMETRYCOLLECTION'))

    const jsonWkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { wkt: 'true' } })).data
    assert.ok(jsonWkt.results[0].geometry.startsWith('LINESTRING'))
  })
})
