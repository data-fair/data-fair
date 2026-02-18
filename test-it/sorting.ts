import { strict as assert } from 'node:assert'
import * as workers from '../api/src/workers/index.ts'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth } from './utils/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('Sorting', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Ignore case and diacritics', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restsort1', {
      isRest: true,
      title: 'restsort1',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
    })

    await ax.post('/api/v1/datasets/restsort1/_bulk_lines', [
      { attr1: 'aaa', attr2: 1 },
      { attr1: 'bbb', attr2: 2 },
      { attr1: 'AAA', attr2: 3 },
      { attr1: 'BBB', attr2: 4 },
      { attr1: 'zzz', attr2: 5 },
      { attr1: 'eee', attr2: 6 },
      { attr1: 'ééé', attr2: 7 }
    ])
    await workers.hook('finalize/restsort1')

    let lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { sort: 'attr1' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['AAA', 'aaa', 'BBB', 'bbb', 'eee', 'ééé', 'zzz'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { sort: '-attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['ééé', 'eee', 'zzz', 'BBB', 'AAA', 'bbb', 'aaa'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { q: 'aaa', sort: 'attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['aaa', 'AAA'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { q: 'aaa', sort: '-attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['AAA', 'aaa'])
  })
})
