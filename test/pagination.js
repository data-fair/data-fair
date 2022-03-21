const assert = require('assert').strict
const workers = require('../server/workers')

describe('data pagination', () => {
  it('get deeper into data', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest-page', {
      isRest: true,
      title: 'rest pagination',
      schema: [{ key: 'attr1', type: 'integer' }, { key: 'attr2', type: 'integer' }]
    })
    await workers.hook('finalizer/rest-page')
    const actions = []
    for (let i = 0; i < 100; i++) {
      actions.push({ _action: 'create', attr1: i, attr2: 99 - i })
    }
    let res = await ax.post('/api/v1/datasets/rest-page/_bulk_lines', actions)
    await workers.hook('finalizer/rest-page')
    assert.equal(res.data.nbOk, 100)
    assert.equal(res.data.nbCreated, 100)

    res = await ax.get('/api/v1/datasets/rest-page/lines')
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 99)
    assert.equal(res.data.results[0].attr2, 0)
    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 87)
    assert.equal(res.data.results[0].attr2, 12)

    res = await ax.get('/api/v1/datasets/rest-page/lines', { params: { size: 20, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 0)
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 20)

    res = await ax.get('/api/v1/datasets/rest-page/lines', { params: { size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)

    res = await ax.get('/api/v1/datasets/rest-page/lines', { params: { page: 2, size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 10)
    assert.equal(res.data.results[0].attr2, 89)
  })
})
