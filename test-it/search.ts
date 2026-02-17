import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('search', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get lines in dataset', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const locProp = dataset.schema.find((p: any) => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    let res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook(`finalize/${dataset.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=koumoul`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=Koumoul`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lactée`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté&q_fields=adr`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté&q_fields=id`)
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_in=koumoul,test`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_eq=koumoul`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_nin=koumoul,test`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_neq=koumoul`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'bidule')
  })
})
