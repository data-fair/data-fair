const assert = require('assert').strict

const workers = require('../server/workers')

describe('query modes', () => {
  it('Search in dataset using all supported query modes', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/wildcards', {
      isRest: true,
      title: 'wildcards',
      schema: [{ key: 'content', type: 'string', 'x-capabilities': { wildcard: true } }]
    })
    await workers.hook('finalizer/wildcards')
    const items = {
      t1: 'prefix',
      t2: 'prefixsuite',
      t3: 'configurations Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt configurations ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit configurer anim id est laborum.',
      p1: 'phrase 1 mot1 mot2 mot3 mot4',
      p2: 'phrase 2 mot1 mot3 mot2 mot4',
      t4: 'prefixSUITE'
    }
    let res = await ax.post('/api/v1/datasets/wildcards/_bulk_lines', Object.keys(items).map(key => ({ _id: key, content: items[key] })))
    await workers.hook('finalizer/wildcards')

    // query with a trailing wildcard works well on the main keyword field
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:prefix' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:prefix*' } })
    assert.equal(res.data.total, 3)

    // leading wildcard filter is rejected by default on the main keyword field
    await assert.rejects(ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:*suite' } }), (err) => err.status === 400)
    await assert.rejects(ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:(prefix OR *suite)' } }), (err) => err.status === 400)
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:*SUITE' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't4')
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:*suite' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't2')
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:(prefix OR *suite)' } })
    assert.equal(res.data.total, 2)
  })
})
