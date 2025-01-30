import { strict as assert } from 'node:assert'

import * as workers from '../api/src/workers/index.js'

describe('truncate', function () {
  it('Truncate results for faster previews', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/truncate1', {
      isRest: true,
      title: 'truncate1',
      schema: [{ key: 'str', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/truncate1/_bulk_lines', [
      { str: 'bla' },
      { str: 'blablabla' }
    ])
    await workers.hook('finalizer/truncate1')
    const res = await ax.get('/api/v1/datasets/truncate1/lines', { params: { truncate: '4', sort: '_i' } })
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].str, 'bla')
    assert.equal(res.data.results[1].str, 'blab...')
  })
})
