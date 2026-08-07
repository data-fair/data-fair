import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('q matching on numeric columns without text_standard', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => { if (testInfo.status === 'passed') await checkPendingTasks() })

  test('whole-value q match via lenient main-field clause', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/numeric-q', {
      isRest: true,
      title: 'numeric-q',
      schema: [{ key: 'code', type: 'integer' }, { key: 'label', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/numeric-q/_bulk_lines', [
      { code: 84500, label: 'orange' },
      { code: 13001, label: 'marseille' }
    ])
    await waitForFinalize(ax, 'numeric-q')

    // whole-value match through the main long field
    let res = await ax.get('/api/v1/datasets/numeric-q/lines', { params: { q: '84500' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 84500)

    // mixed query: string token + numeric token, q_mode=and
    res = await ax.get('/api/v1/datasets/numeric-q/lines', { params: { q: 'orange 84500', q_mode: 'and' } })
    assert.equal(res.data.total, 1)

    // prefix autocompletion on numerics is retired: no partial match
    res = await ax.get('/api/v1/datasets/numeric-q/lines', { params: { q: '845', q_mode: 'complete' } })
    assert.equal(res.data.total, 0)

    // per-column _search filter routes to the main field
    res = await ax.get('/api/v1/datasets/numeric-q/lines', { params: { code_search: '84500' } })
    assert.equal(res.data.total, 1)
  })
})
