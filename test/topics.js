const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('datasets', () => {
  it('Search and apply facets', async () => {
    const ax = global.ax.dmeadus

    // 2 datasets in organization zone
    const dataset1 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'topics' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.topics.length, 0)

    // add topics in user settings
    res = await ax.put('/api/v1/settings/user/dmeadus0', { topics: [{ title: 'topics 1' }, { title: 'topics 2' }] })
    const topics = res.data.topics
    await ax.patch('/api/v1/datasets/' + dataset1.id, { topics: [topics[0]] })
    await ax.patch('/api/v1/datasets/' + dataset2.id, { topics })
    res = await ax.get('/api/v1/datasets', { params: { facets: 'topics' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.topics.length, 2)
    assert.equal(res.data.facets.topics[0].count, 2)
    assert.equal(res.data.facets.topics[0].value.id, topics[0].id)
    assert.equal(res.data.facets.topics[1].count, 1)
    assert.equal(res.data.facets.topics[1].value.id, topics[1].id)
  })
})
