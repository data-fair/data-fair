const assert = require('assert').strict
const workers = require('../server/workers')

describe('data pagination', () => {
  it('get deeper into data', async () => {
    const ax = global.ax.dmeadus

    const schema = [{ key: 'attr1', type: 'integer' }, { key: 'attr2', type: 'integer' }]

    const actions = []
    for (let i = 0; i < 100; i++) {
      actions.push({ _action: 'create', attr1: i, attr2: 99 - i })
    }

    for (let i = 0; i < 3; i++) {
      await ax.put('/api/v1/datasets/rest-page' + i, {
        isRest: true,
        title: 'rest pagination ' + i,
        schema
      })
      await workers.hook('finalizer/rest-page' + i)

      const res = await ax.post(`/api/v1/datasets/rest-page${i}/_bulk_lines`, actions)
      await workers.hook('finalizer/rest-page' + i)
      assert.equal(res.data.nbOk, 100)
      assert.equal(res.data.nbCreated, 100)
    }

    await ax.put('/api/v1/datasets/virtual-page', {
      isVirtual: true,
      virtual: { children: ['rest-page0', 'rest-page1', 'rest-page2'] },
      schema,
      title: 'a virtual dataset'
    })
    await workers.hook('finalizer/virtual-page')

    let res = await ax.get('/api/v1/datasets/rest-page0/lines')
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

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 20, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 0)
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 20)

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { page: 2, size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 10)
    assert.equal(res.data.results[0].attr2, 89)

    res = await ax.get('/api/v1/datasets/virtual-page/lines?size=10&sort=attr1')
    assert.equal(res.data.total, 300)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)
    assert.equal(res.data.results[1].attr1, 0)
    assert.equal(res.data.results[2].attr1, 0)
    assert.equal(res.data.results[9].attr1, 3)

    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    const after = JSON.parse('[' + new URL(res.data.next).searchParams.get('after') + ']')
    assert.equal(after.length, 3)
    assert.equal(after[0], res.data.results[9].attr1)
    assert.equal(after[1], res.data.results[9]._i)
    assert.equal(after[2], res.data.results[9]._rand)

    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 300)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 3)
    assert.equal(res.data.results[1].attr1, 3)
    assert.equal(res.data.results[2].attr1, 4)
  })
})
