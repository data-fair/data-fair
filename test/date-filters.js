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
    await workers.hook('datasetStateManager/rest-date-match')
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { date1: '2023-11-19T23:00:00.000Z' }, // start of 20/11/2023 in our timezone
      { date1: '2023-11-20T23:00:00.000Z' }, // start of 21/11/2023 in our timezone
      { date1: '2023-11-21T23:00:00.000Z' }, // start of 22/11/2023 in our timezone
      { date1: '2023-11-22T08:00:00.000Z' }, // morning of 22/11/2023
      { date1: '2023-11-23T08:00:00.000Z' } // morning of 23/11/2023
    ])
    await workers.hook('datasetStateManager/rest-date-match')

    // filter on a simple date
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z'])

    // filter on a date interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21,2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])

    // filter on a largerdate interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-10,2023-11-28' } })
    assert.equal(res.data.results.length, 5)

    // filter on a date-time interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-20T23:00:00.000Z,2023-11-22T08:00:00.000Z' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
  })

  it('Date match special filter on startDate and endDate fields with date-time format', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [
        { key: 'start', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/startDate' },
        { key: 'end', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/endDate' }
      ]
    })
    await workers.hook('datasetStateManager/rest-date-match')
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { start: '2023-11-19T23:00:00.000Z', end: '2023-11-20T22:59:00.000Z' }, // whole day of 20/11/2023 in our timezone
      { start: '2023-11-20T23:00:00.000Z', end: '2023-11-21T22:59:00.000Z' }, // whole day of 21/11/2023 in our timezone
      { start: '2023-11-18T23:00:00.000Z', end: '2023-11-28T23:00:00.000Z' }, // a larger encompassing interval
      { start: '2023-11-05T23:00:00.000Z', end: '2023-11-07T23:00:00.000Z' } // a separate interval
    ])
    await workers.hook('datasetStateManager/rest-date-match')

    // filter on a simple date inside an interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])

    // filter on a date interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-20,2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-19T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])
  })
})
