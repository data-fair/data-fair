const assert = require('assert').strict

const workers = require('../server/workers')

describe('query modes', () => {
  it('Use the full power of ES query string syntax', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/qsfilters', {
      isRest: true,
      title: 'qmodes',
      schema: [
        { key: 'str1', type: 'string' },
        { key: 'str2', type: 'string' },
        { key: 'int1', type: 'integer' },
        { key: 'nb1', type: 'number' }
      ]
    })
    await workers.hook('finalizer/qsfilters')
    const items = [
      { _id: 'line1', str1: 'test 1' },
      { _id: 'line2', str1: 'test 2' },
      { _id: 'line3', str1: 'special " char' },
      { _id: 'line4', str1: 'special , char' }
    ]
    let res = await ax.post('/api/v1/datasets/qsfilters/_bulk_lines', items)
    await workers.hook('finalizer/qsfilters')

    res = await ax.get('/api/v1/datasets/qsfilters/lines')
    assert.equal(res.data.total, items.length)

    // full text all lines matching at least one token is returned
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'test 1' } })
    assert.equal(res.data.total, 2)

    // full text all lines matching all tokens are returned
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: '"test 1"' } })
    assert.equal(res.data.total, 1)

    // strict equality attribute matching
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test 1"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"Test 1"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str2:"test 1"' } })
    assert.equal(res.data.total, 0)
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'unknownstr:"test 1"' } }), err => err.status === 400)

    // strict equality with escaped special chars
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\" char"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special char"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\, char"' } })
    assert.equal(res.data.total, 1)

    // wrong syntax, return a useful error
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special " char "' } }), err => err.status === 400)

    // TODO: add examples using multi-fields indexing, lowercase, etc ?
  })
})
