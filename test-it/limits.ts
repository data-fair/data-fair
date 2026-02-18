import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, alban, sendDataset, formHeaders } from './utils/index.ts'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'
import config from 'config'

const baseLimit = {
  indexed_bytes: { limit: 300000, consumption: 0 },
  store_bytes: { limit: 300000, consumption: 0 },
  nb_datasets: { limit: 10, consumption: 0 },
  lastUpdate: new Date().toISOString()
}

describe('limits', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Manage a user storage limit', async function () {
    const ax = dmeadus

    // Just fill up a little
    let form = new FormData()
    form.append('file', Buffer.alloc(150000), 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    await assert.rejects(workers.hook('finalize/' + res.data.id))

    // Send dataset applying default limits
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), err: any => err.status === 429)

    // define a higher limit
    res = await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })

    // test storage size limit
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    await assert.rejects(workers.hook('finalize/' + res.data.id))
    assert.equal(res.status, 201)
    form = new FormData()
    form.append('file', Buffer.alloc(100004), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), err: any => err.status === 429)

    // test nb datasets size limit
    let lastDataset
    for (let i = 0; i < 8; i++) {
      lastDataset = (await ax.post('/api/v1/datasets/rest-dataset-' + (i + 1), { title: 'rest-dataset', isRest: true })).data
    }
    await assert.rejects(ax.post('/api/v1/datasets', { title: 'rest-dataset', isRest: true }), err: any => err.status === 429)

    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
    assert.equal(res.data.store_bytes.consumption, 250000)
    assert.equal(res.data.nb_datasets.limit, 10)
    assert.equal(res.data.nb_datasets.consumption, 10)

    // delete a dataset and check nb_datasets
    await ax.delete('/api/v1/datasets/' + lastDataset.id)
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.data.nb_datasets.consumption, 9)
  })

  it('A user cannot change limits', async function () {
    const ax = dmeadus
    await assert.rejects(
      ax.post('/api/v1/limits/user/dmeadus0', baseLimit),
      { status: 403 }
    )
  })

  it('A user can read his limits', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  it('A user cannot read the list of limits', async function () {
    const ax = dmeadus
    await assert.rejects(
      ax.get('/api/v1/limits'),
      { status: 403 }
    )
  })

  it('A super admin can read the list of limits', async function () {
    const ax = alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })
})
