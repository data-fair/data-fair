const assert = require('assert').strict
const workers = require('../server/workers')

describe('Date filters', () => {
  it('Date match special filter on date field with date-time format', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [{ key: 'date1', type: 'string', format: 'date-time', 'x-refersTo': 'http://schema.org/Date' }]
    })
    await workers.hook('finalizer/rest-date-match')
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { date1: '2023-11-19T23:00:00.000Z' }, // start of 20/11/2023 in our timezone
      { date1: '2023-11-20T23:00:00.000Z' }, // start of 21/11/2023 in our timezone
      { date1: '2023-11-21T23:00:00.000Z' }, // start of 22/11/2023 in our timezone
      { date1: '2023-11-22T08:00:00.000Z' }, // morning of 22/11/2023
      { date1: '2023-11-23T08:00:00.000Z' } // morning of 23/11/2023
    ])
    await workers.hook('finalizer/rest-date-match')

    // filter on a simple date
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z'])

    // filter on a date interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21,2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])

    // filter on a date-time interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-20T23:00:00.000Z,2023-11-22T08:00:00.000Z' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
  })
})
