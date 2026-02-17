import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('qs parameter', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Use the full power of ES query string syntax', async function () {
    const ax = dmeadus
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
    const items = [
      { _id: 'line1', str1: 'test 1' },
      { _id: 'line2', str1: 'test 2' },
      { _id: 'line3', str1: 'special " char' },
      { _id: 'line4', str1: 'special , char' }
    ]
    let res = await ax.post('/api/v1/datasets/qsfilters/_bulk_lines', items)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/qsfilters')

    res = await ax.get('/api/v1/datasets/qsfilters/lines')
    assert.equal(res.data.total, items.length)

    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'test 1' } })
    assert.equal(res.data.total, 2)

    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: '"test 1"' } })
    assert.equal(res.data.total, 1)

    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test 1"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"Test 1"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str2:"test 1"' } })
    assert.equal(res.data.total, 0)
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'unknownstr:"test 1"' } }), (err: any) => err.status === 400)

    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\" char"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special char"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\, char"' } })
    assert.equal(res.data.total, 1)

    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special " char "' } }), (err: any) => err.status === 400)
  })
})
