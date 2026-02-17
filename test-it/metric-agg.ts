import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('metric agg', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('performs calculations on a field', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/metric-agg', {
      isRest: true,
      title: 'metric-agg',
      schema: [
        { key: 'numfield', type: 'number' },
        { key: 'textfield', type: 'string' },
        { key: 'datefield', type: 'string', format: 'date' },
        { key: 'datetimefield', type: 'string', format: 'date-time' },
        { key: 'booleanfield', type: 'boolean' },
        { key: 'textfield2', type: 'string', 'x-capabilities': { values: false } }
      ]
    })
    await ax.post('/api/v1/datasets/metric-agg/_bulk_lines', [
      { numfield: 0, textfield: 'a', datefield: '2020-12-01', datetimefield: '2020-12-01T01:10:10Z', booleanfield: false },
      { numfield: 1, textfield: 'b', datefield: '2020-12-02', datetimefield: '2020-12-01T02:10:10Z', booleanfield: true },
      { numfield: 2, textfield: 'c', datefield: '2020-12-03', datetimefield: '2020-12-01T03:10:10Z', booleanfield: true },
      { numfield: 3, textfield: 'd', datefield: '2020-12-04', datetimefield: '2020-12-01T04:10:10Z', booleanfield: true },
      { numfield: 4, textfield: 'e', datefield: '2020-12-05', datetimefield: '2020-12-01T05:10:10Z', booleanfield: true },
      { numfield: 5, textfield: 'f', datefield: '2020-12-06', datetimefield: '2020-12-01T06:10:10Z', booleanfield: true },
      { numfield: 6, textfield: 'g', datefield: '2020-12-07', datetimefield: '2020-12-01T07:10:10Z', booleanfield: true },
      { numfield: 7, textfield: 'h', datefield: '2020-12-08', datetimefield: '2020-12-01T08:10:10Z', booleanfield: true },
      { numfield: 8, textfield: 'i', datefield: '2020-12-09', datetimefield: '2020-12-01T09:10:10Z', booleanfield: true },
      { numfield: 9, textfield: 'j', datefield: '2020-12-10', datetimefield: '2020-12-01T10:10:10Z', booleanfield: true },
      { numfield: 10, textfield: 'k', datefield: '2020-12-11', datetimefield: '2020-12-01T11:10:10Z', booleanfield: true }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/metric-agg')

    await assert.rejects(ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'scripted_metric' }
    }), { status: 400 })

    const avg = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'avg' }
    })).data.metric
    assert.equal(avg, 5)

    const sum = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'sum' }
    })).data.metric
    assert.equal(sum, 55)

    const min = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'min' }
    })).data.metric
    assert.equal(min, 0)

    const max = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'max' }
    })).data.metric
    assert.equal(max, 10)

    const stats = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'stats' }
    })).data.metric
    assert.equal(stats.max, 10)

    const cardinality = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'textfield', metric: 'cardinality' }
    })).data.metric
    assert.equal(cardinality, 11)

    const filteredCardinality = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'textfield', metric: 'cardinality', qs: 'numfield:<3' }
    })).data.metric
    assert.equal(filteredCardinality, 3)

    const valueCount = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'value_count' }
    })).data.metric
    assert.equal(valueCount, 11)

    const percentiles = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'percentiles' }
    })).data.metric
    assert.equal(percentiles.length, 7)
    assert.equal(percentiles[3].key, 50)
  })
})
