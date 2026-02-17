import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('virtual datasets', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Create an empty virtual dataset', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
    const workers = await import('../api/src/workers/index.ts')
    await assert.rejects(workers.hook('finalize/' + res.data.id))
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  it('Create a new virtual dataset with predefined id', async function () {
    const ax = dmeadus
    const res = await ax.put('/api/v1/datasets/my-id', { isVirtual: true, title: 'a virtual dataset' })
    const workers = await import('../api/src/workers/index.ts')
    await assert.rejects(workers.hook('finalize/' + res.data.id))
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  it('Create a virtual dataset with a child and query', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [dataset.id]
      },
      title: 'a virtual dataset'
    })
    const workers = await import('../api/src/workers/index.ts')
    const virtualDataset = await workers.hook('finalize/' + res.data.id)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })
})
