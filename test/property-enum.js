// Some edge cases with CSV files
const assert = require('assert').strict
const workers = require('../server/workers')

describe('Enum of actual values in schema', () => {
  it('Calculate enum of values in data', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }],
    })
    await workers.hook('finalizer/rest2')
    await ax.post('/api/v1/datasets/rest2/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test2', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test3' },
      { attr1: 'test1', attr2: 'test4' },
      { attr1: 'test2', attr2: 'test5' },
      { attr1: 'test2', attr2: 'test6' },
      { attr1: 'test2', attr2: 'test7' },
      { attr1: 'test2', attr2: 'test8' },
      { attr1: 'test2', attr2: 'test9' },
      { attr1: 'test2', attr2: 'test9' },
    ])
    const dataset = await workers.hook('finalizer/rest2')
    const attr1 = dataset.schema.find(p => p.key === 'attr1')
    assert.deepEqual(attr1.enum, ['test2', 'test1'])

    // cardinality too close to line count
    const attr2 = dataset.schema.find(p => p.key === 'attr2')
    assert.equal(attr2.enum, undefined)
    // too sparse
    const attr3 = dataset.schema.find(p => p.key === 'attr3')
    assert.equal(attr3.enum, undefined)
  })
})
