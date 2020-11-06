const assert = require('assert').strict
const workers = require('../server/workers')

describe('Sorting', () => {
  it('Ignore case and diacritics', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restsort1',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }],
    })

    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'aaa' })
    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'bbb' })
    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'AAA' })
    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'BBB' })
    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'zzz' })
    await ax.post('/api/v1/datasets/restsort1/lines', { attr1: 'ééé' })
    await workers.hook('finalizer/restsort1')

    const lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { sort: 'attr1' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['aaa', 'AAA', 'bbb', 'BBB', 'ééé', 'zzz'])
    console.log(lines.data.results.map(r => r.attr1))
  })
})
