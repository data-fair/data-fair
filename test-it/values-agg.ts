import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset, formHeaders } from './utils/index.ts'
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
})
