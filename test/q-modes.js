const assert = require('assert').strict

const workers = require('../server/workers')

describe('query modes', () => {
  it('Search in dataset using all supported query modes', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/qmodes', {
      isRest: true,
      title: 'qmodes',
      schema: [{ key: 'content', type: 'string' }],
    })
    let dataset = await workers.hook('indexer/qmodes')
    const items = {
      t1: 'prefix',
      t2: 'prefixsuite',
      p1: 'phrase 1 mot1 mot2 mot3 mot4',
      p2: 'phrase 2 mot1 mot3 mot2 mot4',
    }
    let res = await ax.post('/api/v1/datasets/qmodes/_bulk_lines', Object.keys(items).map(key => ({ _id: key, content: items[key] })))
    await workers.hook('indexer/qmodes')
    dataset = await workers.hook('finalizer/qmodes')
    assert.ok(dataset.schema.find(f => f.key === '_id'))
    assert.ok(dataset.schema.find(f => f.key === '_updatedAt'))
    res = await ax.get('/api/v1/datasets/qmodes/lines')
    assert.equal(res.data.total, Object.keys(items).length)

    // simple mode searches for a full word
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'prefix', q_mode: 'simple' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't1')

    // complete searches for start of word as well as full word
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'prefix', q_mode: 'complete' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._score > res.data.results[1]._score)
    assert.equal(res.data.results[0]._id, 't1')
    assert.equal(res.data.results[1]._id, 't2')

    // simple searches for separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'simple' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._score, res.data.results[1]._score)
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: '"mot1 mot2"', q_mode: 'simple' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'p1')

    // complete searches for phrases as well separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'complete' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._score > res.data.results[1]._score)
  })
})
