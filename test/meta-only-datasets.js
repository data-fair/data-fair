import { strict as assert } from 'node:assert'
import * as workers from '../api/src/workers/index.js'

describe('meta only datasets', function () {
  it('Create simple meta only datasets', async function () {
    const ax = global.ax.dmeadus

    const res = await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'a meta only dataset' })
    assert.equal(res.status, 201)
    let dataset = res.data
    assert.equal(dataset.slug, 'a-meta-only-dataset')

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'a meta only dataset 2' })

    // publish on a catalog
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publications: [{ catalogId: 'test', status: 'waiting' }] })

    // Go through the publisher worker
    dataset = await workers.hook('datasetPublisher')
    assert.equal(dataset.publications[0].status, 'error')
  })
})
