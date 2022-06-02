const assert = require('assert').strict

const workers = require('../server/workers')

describe('metric agg', () => {
  it('performs calculations on a field', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/metric-agg', {
      isRest: true,
      title: 'metric-agg',
      schema: [{ key: 'numfield', type: 'number' }]
    })
    await workers.hook('finalizer/metric-agg')
    await ax.post('/api/v1/datasets/metric-agg/_bulk_lines', [
      { numfield: 0 },
      { numfield: 1 },
      { numfield: 2 },
      { numfield: 3 },
      { numfield: 4 },
      { numfield: 5 },
      { numfield: 6 },
      { numfield: 7 },
      { numfield: 8 },
      { numfield: 9 },
      { numfield: 10 }
    ])
    await workers.hook('finalizer/metric-agg')

    await assert.rejects(ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'scripted_metric' }
    }), (err) => err.status === 400)

    const avg = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'avg' }
    })).data.metric
    assert.equal(avg, 5)

    const sum = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'sum' }
    })).data.metric
    assert.equal(sum, 55)

    const min = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'min' }
    })).data.metric
    assert.equal(min, 0)

    const max = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'max' }
    })).data.metric
    assert.equal(max, 10)

    const stats = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'stats' }
    })).data.metric
    assert.equal(stats.max, 10)

    const cardinality = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'cardinality' }
    })).data.metric
    assert.equal(cardinality, 11)

    const filteredCardinality = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'cardinality', qs: 'numfield:<3' }
    })).data.metric
    assert.equal(filteredCardinality, 3)

    const valueCount = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'value_count' }
    })).data.metric
    assert.equal(valueCount, 11)

    const percentiles = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'percentiles' }
    })).data.metric
    assert.equal(percentiles.length, 7)
    assert.equal(percentiles[3].key, 50)
    assert.equal(percentiles[3].value, 5)

    const percentiles2 = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { metric_field: 'numfield', metric: 'percentiles', percents: '50,75' }
    })).data.metric
    assert.equal(percentiles2.length, 2)
    assert.equal(percentiles2[0].key, 50)
    assert.equal(percentiles2[0].value, 5)
  })
})
