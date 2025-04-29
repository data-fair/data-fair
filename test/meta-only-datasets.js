import { strict as assert } from 'node:assert'

describe('meta only datasets', function () {
  it('Create simple meta only datasets', async function () {
    const ax = global.ax.dmeadus

    const res = await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'a meta only dataset' })
    assert.equal(res.status, 201)
    const dataset = res.data
    assert.equal(dataset.slug, 'a-meta-only-dataset')

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'a meta only dataset 2' })
  })
})
