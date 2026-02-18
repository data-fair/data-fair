import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders, sendDataset } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

import * as workers from '../api/src/workers/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('values aggs', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get values buckets', async function () {
    const datasetData = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form = new FormData()
    form.append('file', datasetData, 'dataset.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.deepEqual(dataset.schema.find(p => p.key === 'somedate').enum, ['2017-12-12', '2017-10-10'])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    // Simple value aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id`)
    assert.equal(res.data.total, 6) // Number of items
    assert.equal(res.data.total_values, 2) // Number of distinct values (cardinality)
    assert.equal(res.data.total_other, 0) // Number of items not covered by agg results
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].total, 3) // default sorting by count
    assert.equal(res.data.aggs[0].results.length, 0)

    // put missing values in a group
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&missing=none`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[2].total, 1)
    assert.equal(res.data.aggs[2].value, 'none')

    // Value aggregation + metric
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs[0].metric, 13) // default sorting by metric

    // Value aggregation + extra metrics
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&extra_metrics=employees:sum,employees:avg`)
    // default sorting by total
    assert.equal(res.data.aggs[0].value, 'koumoul')
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].employees_sum, 3)
    assert.equal(res.data.aggs[0].employees_avg, 1)
    assert.equal(res.data.aggs[1].total, 2)
    assert.equal(res.data.aggs[1].employees_sum, 13)
    assert.equal(res.data.aggs[1].employees_avg, 6.5)

    // Sorting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum&sort=-id`)
    assert.equal(res.data.aggs[0].value, 'koumoul')

    // Pagination
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum&agg_size=1&sort=-id`)
    assert.equal(res.data.aggs[0].value, 'koumoul')
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.aggs[0].value, 'bidule')
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.aggs?.length, 0)
    assert.ok(!res.data.next)

    // with inner hits as results array
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count;employees,_i`)
    let resComma = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count,employees,_i`)
    assert.equal(res.data.aggs[0].results.length, 3)
    assert.equal(res.data.aggs[0].results[0].employees, 0)
    assert.equal(res.data.aggs[0].results[0]._i, 2)
    assert.deepEqual(res.data, resComma.data)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count;employees,-_i`)
    resComma = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count,employees,-_i`)
    assert.equal(res.data.aggs[0].results.length, 3)
    assert.equal(res.data.aggs[0].results[0].employees, 0)
    assert.equal(res.data.aggs[0].results[0]._i, 3)
    assert.deepEqual(res.data, resComma.data)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count;-employees`)
    assert.equal(res.data.aggs[0].results.length, 3)
    assert.equal(res.data.aggs[0].results[0].employees, 3)

    // limit number of groups with agg_size
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&agg_size=1`)
    assert.equal(res.data.aggs.length, 1)
    assert.equal(res.data.total_other, 2)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&agg_size=1000000`), { status: 400 })
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&agg_size=1000&size=1000`), { status: 400 })

    // 2 level aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id;adr&metric_field=employees&metric=sum&sort=-count;-count`)
    resComma = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id,adr&metric_field=employees&metric=sum&sort=-count,-count`)
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].aggs.length, 2)
    assert.equal(res.data.aggs[0].aggs[0].value, 'bureau')
    assert.equal(res.data.aggs[0].aggs[0].total, 2)
    assert.equal(res.data.aggs[0].aggs[0].metric, 0)
    assert.deepEqual(res.data, resComma.data)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id;adr&agg_size=100|100&size=100`), { status: 400 })

    // 2 level aggregation with inner results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id;adr&metric_field=employees&metric=sum&sort=-count;-count&size=10`)
    resComma = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id,adr&metric_field=employees&metric=sum&sort=-count,-count&size=10`)
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].aggs.length, 2)
    assert.equal(res.data.aggs[0].aggs[0].value, 'bureau')
    assert.equal(res.data.aggs[0].aggs[0].total, 2)
    assert.equal(res.data.aggs[0].aggs[0].metric, 0)
    assert.equal(res.data.aggs[0].aggs[0].results.length, 2)
    assert.deepEqual(res.data, resComma.data)

    // date histogram aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=somedate&interval=month&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[0].total, 2)
    assert.equal(res.data.aggs[1].total, 0)
    assert.equal(res.data.aggs[2].total, 3)
    assert.equal(res.data.aggs[0].value, '2017-10-01')
    assert.equal(res.data.aggs[0].metric, 13)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=somedate&interval=30m&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs[0].total, 2)
    assert.equal(res.data.aggs[1].total, 0)
    assert.equal(res.data.aggs[res.data.aggs.length - 1].total, 3)

    // Other values route for simpler list of values
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id`)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0], 'bidule')
    assert.equal(res.data[1], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id?sort=desc`)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0], 'koumoul')
    assert.equal(res.data[1], 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id?q=kou*`)
    assert.equal(res.data.length, 1)
    assert.equal(res.data[0], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id?q=kou&q_mode=complete`)
    assert.equal(res.data.length, 1)
    assert.equal(res.data[0], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/somedate`)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0], '2017-10-10')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/somedate?q=2017-10&q_mode=complete`)
    assert.equal(res.data[0], '2017-10-10')

    // also with labels
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values-labels/id`)
    assert.equal(res.data.length, 2)
    assert.deepEqual(res.data[0], { value: 'bidule', label: 'bidule' })
    dataset.schema[0]['x-labels'] = { bidule: 'Bidule' }
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values-labels/id`)
    assert.equal(res.data.length, 2)
    assert.deepEqual(res.data[0], { value: 'bidule', label: 'Bidule' })

    // return readable errors for invalid parameters
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=unknown`), (/** @type {any} */err) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Le paramètre "field" référence un champ inconnu unknown'))
      return true
    })
    const newSchema = [...dataset.schema]
    const adrProp = newSchema.find(p => p.key === 'adr')
    adrProp['x-capabilities'] = { values: false }
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: newSchema })
    await workers.hook(`finalize/${dataset.id}`)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=adr`), (/** @type {any} */err) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible de grouper sur le champ adr'))
      return true
    })
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&sort=adr`), (/** @type {any} */err) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible de trier les groupes de la colonne id par adr'))
      return true
    })
  })

  it('Get values buckets based on number values', async function () {
    const ax = dmeadus
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest values aggs',
      schema: [{ key: 'year', type: 'number' }, { key: 'nb', type: 'number' }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { year: 2020, nb: 2 },
      { year: 2020, nb: 4 },
      { year: 2021, nb: 2 },
      { nb: 2 },
      { nb: 3 }
    ])
    await workers.hook(`finalize/${dataset.id}`)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 2020)
    assert.equal(res.data.aggs[0].metric, 6)

    // accept missing parameter
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum&missing=-1`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[0].value, 2020)
    assert.equal(res.data.aggs[0].metric, 6)
    assert.equal(res.data.aggs[1].value, -1)
    assert.equal(res.data.aggs[1].metric, 5)

    // reject missing parameter of wrong type
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum&missing=none`), (err: any) => {
      assert.ok(err.data.includes('missing should be a number'))
      assert.equal(err.status, 400)
      return true
    })
  })

  it('Get values buckets based on boolean values', async function () {
    const ax = dmeadus
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest values aggs',
      schema: [{ key: 'active', type: 'boolean' }, { key: 'nb', type: 'number' }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { active: true, nb: 2 },
      { active: true, nb: 4 },
      { active: false, nb: 2 },
      { nb: 2 },
      { nb: 3 }
    ])
    await workers.hook(`finalize/${dataset.id}`)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 'true')
    assert.equal(res.data.aggs[0].metric, 6)

    // accept missing parameter
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum&missing=false`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 'false')
    assert.equal(res.data.aggs[0].metric, 7)
    assert.equal(res.data.aggs[1].value, 'true')
    assert.equal(res.data.aggs[1].metric, 6)

    // reject missing parameter of wrong type
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum&missing=none`), (err: any) => {
      assert.ok(err.data.includes('missing should be a boolean'))
      assert.equal(err.status, 400)
      return true
    })
  })

  it('Get words buckets', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: [{ key: 'adr', type: 'string', 'x-capabilities': { textAgg: true } }] })
    await workers.hook(`finalize/${dataset.id}`)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/words_agg?field=adr`)
    assert.equal(res.data.total, 2) // Number of items
    assert.ok(res.data.results.find(r => r.word === 'adresse'))
  })

  it('performs calculations on a field', async function () {
    // Load a few lines
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
    await workers.hook('finalize/metric-agg')

    await assert.rejects(ax.get('/api/v1/datasets/metric-agg/metric_agg', {
      params: { field: 'numfield', metric: 'scripted_metric' }
    }), (err: any) => err.status === 400)

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
    res = (await ax.get('/api/v1/datasets/metric-agg/simple_metrics_agg', { params: { qs: 'numfield:>3', fields: 'numfield', metrics: 'sum,avg' } })).data
    assert.equal(res.total, 7)
    assert.equal(res.metrics.numfield.sum, 49)
    assert.equal(res.metrics.numfield.avg, 7)
  })
})
