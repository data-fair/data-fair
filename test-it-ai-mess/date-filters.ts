import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('Date filters', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Date match special filter on date field with date-time format', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [{ key: 'date1', type: 'string', format: 'date-time', 'x-refersTo': 'http://schema.org/Date' }]
    })
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { date1: '2023-11-19T23:00:00.000Z' },
      { date1: '2023-11-20T23:00:00.000Z' },
      { date1: '2023-11-21T23:00:00.000Z' },
      { date1: '2023-11-22T08:00:00.000Z' },
      { date1: '2023-11-23T08:00:00.000Z' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-date-match')

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map((result: any) => result.date1), ['2023-11-20T23:00:00.000Z'])

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21,2023-11-22' } })
    assert.deepEqual(res.data.results.map((result: any) => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gte: '2023-11-21', date1_lte: '2023-11-22' } })
    assert.deepEqual(res.data.results.map((result: any) => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gt: '2023-11-20', date1_lt: '2023-11-22' } })
    assert.deepEqual(res.data.results.map((result: any) => result.date1), ['2023-11-20T23:00:00.000Z'])

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-10,2023-11-28' } })
    assert.equal(res.data.results.length, 5)

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-20T23:00:00.000Z,2023-11-22T08:00:00.000Z' } })
    assert.deepEqual(res.data.results.map((result: any) => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
  })

  it('Date match special filter on startDate and endDate fields with date-time format', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [
        { key: 'start', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/startDate' },
        { key: 'end', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/endDate' }
      ]
    })
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { start: '2023-11-19T23:00:00.000Z', end: '2023-11-20T22:59:00.000Z' },
      { start: '2023-11-20T23:00:00.000Z', end: '2023-11-21T22:59:00.000Z' },
      { start: '2023-11-18T23:00:00.000Z', end: '2023-11-28T23:00:00.000Z' },
      { start: '2023-11-05T23:00:00.000Z', end: '2023-11-07T23:00:00.000Z' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-date-match')

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map((result: any) => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])

    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-20,2023-11-21' } })
    assert.deepEqual(res.data.results.map((result: any) => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-19T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])
  })
})
