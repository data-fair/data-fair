const assert = require('assert').strict

const workers = require('../server/workers')

describe('metric agg', () => {
  beforeEach(async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
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
    await workers.hook('finalizer/metric-agg')
    await ax.post('/api/v1/datasets/metric-agg/_bulk_lines', [
      { numfield: 0, textfield: 'a', datefield: '2020-12-01', datetimefield: '2020-12-01T01:10:10Z', booleanfield: false },
      { numfield: 1, textfield: 'b', datefield: '2020-12-02', datetimefield: '2020-12-01T02:10:10Z', booleanfield: true },
      { numfield: 2, textfield: 'c', datefield: '2020-12-03', datetimefield: '2020-12-01T03:10:10Z' },
      { numfield: 3, textfield: 'd', datefield: '2020-12-04', datetimefield: '2020-12-01T04:10:10Z' },
      { numfield: 4, textfield: 'e', datefield: '2020-12-05', datetimefield: '2020-12-01T05:10:10Z' },
      { numfield: 5, textfield: 'f', datefield: '2020-12-06', datetimefield: '2020-12-01T06:10:10Z' },
      { numfield: 6, textfield: 'g', datefield: '2020-12-07', datetimefield: '2020-12-01T07:10:10Z' },
      { numfield: 7, textfield: 'h', datefield: '2020-12-08', datetimefield: '2020-12-01T08:10:10Z' },
      { numfield: 8, textfield: 'i', datefield: '2020-12-09', datetimefield: '2020-12-01T09:10:10Z' },
      { numfield: 9, textfield: 'j', datefield: '2020-12-10', datetimefield: '2020-12-01T10:10:10Z' },
      { numfield: 10, textfield: 'k', datefield: '2020-12-11', datetimefield: '2020-12-01T11:10:10Z' }
    ])
    await workers.hook('finalizer/metric-agg')
  })

  it('performs calculations on a field', async function () {
    const ax = global.ax.dmeadus
    await assert.rejects(ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'scripted_metric' }
    }), (err) => err.status === 400)

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
    assert.equal(percentiles[3].value, 5)

    const percentiles2 = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'percentiles', percents: '50,75' }
    })).data.metric
    assert.equal(percentiles2.length, 2)
    assert.equal(percentiles2[0].key, 50)
    assert.equal(percentiles2[0].value, 5)

    const minDate = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'datefield', metric: 'min' }
    })).data.metric
    assert.equal(minDate, '2020-12-01')

    const maxDate = (await ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'datefield', metric: 'max' }
    })).data.metric
    assert.equal(maxDate, '2020-12-11')
  })

  it('performs multiple basic calculations on a list of fields', async function () {
    const ax = global.ax.dmeadus
    let res = (await ax.get('/api/v1/datasets/metric-agg/simple_metrics_agg')).data
    assert.equal(res.total, 11)
    assert.equal(res.metrics.numfield.min, 0)
    assert.equal(res.metrics.datefield.min, '2020-12-01')
    assert.equal(res.metrics.datetimefield.min, '2020-12-01T02:10:10+01:00')
    assert.equal(res.metrics.textfield.cardinality, 11)
    assert.ok(!res.metrics.textfield2)
    res = (await ax.get('/api/v1/datasets/metric-agg/simple_metrics_agg', { params: { qs: 'numfield:>3' } })).data
    assert.equal(res.total, 7)
    assert.equal(res.metrics.numfield.min, 4)
    assert.equal(res.metrics.datefield.min, '2020-12-05')
    assert.equal(res.metrics.datetimefield.min, '2020-12-01T06:10:10+01:00')
    assert.equal(res.metrics.textfield.cardinality, 7)
    res = (await ax.get('/api/v1/datasets/metric-agg/simple_metrics_agg', { params: { qs: 'numfield:>3', fields: 'numfield,textfield' } })).data
    assert.equal(res.total, 7)
    assert.equal(res.metrics.numfield.min, 4)
    assert.ok(!res.metrics.datefield)
    assert.ok(!res.metrics.datetimefield)
  })
})
