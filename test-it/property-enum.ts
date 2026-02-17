import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('Enum of actual values in schema', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Calculate enum of values in data', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }]
    })
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
      { attr1: '', attr2: 'test10' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook('finalize/rest2')
    const attr1 = dataset.schema.find((p: any) => p.key === 'attr1')
    assert.deepEqual(attr1.enum, ['test2', 'test1'])

    const attr2 = dataset.schema.find((p: any) => p.key === 'attr2')
    assert.equal(attr2.enum, undefined)
    const attr3 = dataset.schema.find((p: any) => p.key === 'attr3')
    assert.equal(attr3.enum, undefined)
  })
})
