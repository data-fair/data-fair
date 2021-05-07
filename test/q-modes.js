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
    let dataset = await workers.hook('finalizer/qmodes')
    const items = {
      t1: 'prefix',
      t2: 'prefixsuite',
      t3: 'configurations Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt configurations ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit configurer anim id est laborum.',
      p1: 'phrase 1 mot1 mot2 mot3 mot4',
      p2: 'phrase 2 mot1 mot3 mot2 mot4',
    }
    let res = await ax.post('/api/v1/datasets/qmodes/_bulk_lines', Object.keys(items).map(key => ({ _id: key, content: items[key] })))
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

    // complete searches for start of word is not broken by stemming
    for (let i = 3; i < 'configuration'.length; i++) {
      res = await ax.get('/api/v1/datasets/qmodes/lines', {
        params: {
          q: 'configuration'.substring(0, i + 1),
          q_mode: 'complete',
          highlight: 'content',
        },
      })
      assert.ok(res.data.results[0]._highlight.content[0].includes('"highlighted"'))
      assert.equal(res.data.total, 1)
    }

    // simple searches for separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'simple' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._score, res.data.results[1]._score)
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: '"mot1 mot2"', q_mode: 'simple' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'p1')

    // complete searches for phrases as well as separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'complete' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._score > res.data.results[1]._score)
  })
})
