import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.js'
import config from 'config'

const baseLimit = {
  indexed_bytes: { limit: 300000, consumption: 0 },
  store_bytes: { limit: 300000, consumption: 0 },
  nb_datasets: { limit: 10, consumption: 0 },
  lastUpdate: new Date().toISOString()
}

describe('limits', function () {
  it('Manage a user storage limit', async function () {
    const ax = global.ax.dmeadus

    // Just fill up a little
    let form = new FormData()
    form.append('file', Buffer.alloc(150000), 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    await assert.rejects(workers.hook('finalizer/' + res.data.id))

    // Send dataset applying default limits
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) }), err => err.status === 429)

    // define a higher limit
    res = await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })

    // test storage size limit
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    await assert.rejects(workers.hook('finalizer/' + res.data.id))
    assert.equal(res.status, 201)
    form = new FormData()
    form.append('file', Buffer.alloc(100004), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) }), err => err.status === 429)

    // test nb datasets size limit
    let lastDataset
    for (let i = 0; i < 8; i++) {
      lastDataset = (await ax.post('/api/v1/datasets/rest-dataset-' + (i + 1), { title: 'rest-dataset', isRest: true })).data
    }
    await assert.rejects(ax.post('/api/v1/datasets', { title: 'rest-dataset', isRest: true }), err => err.status === 429)

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
    const ax = global.ax.dmeadus
    try {
      await ax.post('/api/v1/limits/user/dmeadus0', baseLimit)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 401)
    }
  })

  it('A user can read his limits', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  it('A user cannot read the list of limits', async function () {
    const ax = global.ax.dmeadus
    try {
      await ax.get('/api/v1/limits')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 401)
    }
  })

  it('A super admin can read the list of limits', async function () {
    const ax = global.ax.alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })
})
