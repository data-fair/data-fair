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

  // Pin, not a red/green cycle: this 400 is the pre-existing requiredCapability behavior
  // (unchanged by this task) for a column with no analyzed subfield at all. What this test
  // actually exercises is the controller ruling that the new noNumericText branch in
  // commons.ts's `_search` handling must NOT intercept this column and route it to the lenient
  // main-field clause instead — it has to fall through to the existing empty-subfields 400.
  test('explicit textStandard:false opt-out on a numeric column still 400s on col_search, not lenient-routed', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/numeric-q-optout', {
      isRest: true,
      title: 'numeric-q-optout',
      schema: [
        { key: 'code', type: 'integer', 'x-capabilities': { textStandard: false } },
        { key: 'label', type: 'string' }
      ]
    })
    await ax.post('/api/v1/datasets/numeric-q-optout/_bulk_lines', [
      { code: 84500, label: 'orange' }
    ])
    await waitForFinalize(ax, 'numeric-q-optout')

    await assert.rejects(
      ax.get('/api/v1/datasets/numeric-q-optout/lines', { params: { code_search: '84500' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })
})
