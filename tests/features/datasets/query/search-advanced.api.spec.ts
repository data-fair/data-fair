import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('search - advanced', () => {
  test.beforeAll(async () => {
    await setConfig('cache.disabled', false)
  })

  test.afterAll(async () => {
    await setConfig('cache.disabled', true)
  })

  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Use the full power of ES query string syntax', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/qsfilters', {
      isRest: true,
      title: 'qmodes',
      schema: [
        { key: 'str1', type: 'string' },
        { key: 'str2', type: 'string' },
        { key: 'int1', type: 'integer' },
        { key: 'nb1', type: 'number' }
      ]
    })
    const items = [
      { _id: 'line1', str1: 'test 1' },
      { _id: 'line2', str1: 'test 2' },
      { _id: 'line3', str1: 'special " char' },
      { _id: 'line4', str1: 'special , char' }
    ]
    let res = await ax.post('/api/v1/datasets/qsfilters/_bulk_lines', items)
    await waitForFinalize(ax, 'qsfilters')
    res = await ax.get('/api/v1/datasets/qsfilters/lines')
    assert.equal(res.data.total, items.length)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'test 1' } })
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: '"test 1"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test 1"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"Test 1"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str2:"test 1"' } })
    assert.equal(res.data.total, 0)
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'unknownstr:"test 1"' } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\" char"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special char"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\, char"' } })
    assert.equal(res.data.total, 1)
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special " char "' } }), (err: any) => err.status === 400)
  })

  test('get deeper into data', async () => {
    const ax = testUser1
    const schema = [{ key: 'attr1', type: 'integer' }, { key: 'attr2', type: 'integer' }]
    const actions = []
    for (let i = 0; i < 100; i++) {
      actions.push({ _action: 'create', attr1: i, attr2: 99 - i })
    }
    for (let i = 0; i < 3; i++) {
      await ax.put('/api/v1/datasets/rest-page' + i, { isRest: true, title: 'rest pagination ' + i, schema })
      const res = await ax.post(`/api/v1/datasets/rest-page${i}/_bulk_lines`, actions)
      await waitForFinalize(ax, 'rest-page' + i)
      assert.equal(res.data.nbOk, 100)
      assert.equal(res.data.nbCreated, 100)
    }
    await ax.put('/api/v1/datasets/virtual-page', {
      isVirtual: true,
      virtual: { children: ['rest-page0', 'rest-page1', 'rest-page2'] },
      schema,
      title: 'a virtual dataset'
    })
    await waitForFinalize(ax, 'virtual-page')
    let res = await ax.get('/api/v1/datasets/rest-page0/lines')
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 99)
    assert.equal(res.data.results[0].attr2, 0)
    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    res = await ax.get(res.data.next)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 87)
    assert.equal(res.data.results[0].attr2, 12)
    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 20, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 0)
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 20)
    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)
    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { page: 2, size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 10)
    assert.equal(res.data.results[0].attr2, 89)
    res = await ax.get('/api/v1/datasets/virtual-page/lines?size=10&sort=attr1')
    assert.equal(res.data.total, 300)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)
    assert.equal(res.data.results[1].attr1, 0)
    assert.equal(res.data.results[2].attr1, 0)
    assert.equal(res.data.results[9].attr1, 3)
    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    const after = JSON.parse('[' + new URL(res.data.next).searchParams.get('after') + ']')
    assert.equal(after.length, 3)
    assert.equal(after[0], res.data.results[9].attr1)
    assert.equal(after[1], res.data.results[9]._i)
    assert.equal(after[2], res.data.results[9]._rand)
    res = await ax.get(res.data.next)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 3)
    assert.equal(res.data.results[1].attr1, 3)
    assert.equal(res.data.results[2].attr1, 4)
  })

  test('Date match special filter on date field with date-time format', async () => {
    const ax = testUser1
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
    await waitForFinalize(ax, 'rest-date-match')
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21,2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gte: '2023-11-21', date1_lte: '2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gt: '2023-11-20', date1_lt: '2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-10,2023-11-28' } })
    assert.equal(res.data.results.length, 5)
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-20T23:00:00.000Z,2023-11-22T08:00:00.000Z' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
  })

  test('Date match special filter on startDate and endDate fields with date-time format', async () => {
    const ax = testUser1
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
    await waitForFinalize(ax, 'rest-date-match')
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-20,2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-19T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])
  })
})
