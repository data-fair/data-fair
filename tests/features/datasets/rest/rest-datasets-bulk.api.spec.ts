import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import moment from 'moment'
import zlib from 'zlib'
import iconv from 'iconv-lite'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser5 = await axiosAuth('test_user5@test.com')
const testUser4 = await axiosAuth('test_user4@test.com')

test.describe('REST datasets - Bulk', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Send bulk requests in ndjson file', async () => {
    const ax = testUser5
    let res = await ax.post('/api/v1/datasets/restndjson', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' },
        { key: 'bytes', type: 'number' },
        { key: 'method', type: 'string' },
        { key: 'protocol', type: 'string' },
        { key: 'status', type: 'string' },
        { key: 'referer', type: 'string' },
        { key: 'url', type: 'string', 'x-refersTo': 'https://schema.org/WebPage' },
        { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
        { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' },
        { key: 'browser', type: 'string' },
        { key: 'device', type: 'string' },
        { key: 'os', type: 'string' },
        { key: 'collection', type: 'string' },
        { key: 'resourceId', type: 'string' },
        { key: 'operation', type: 'string' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('./tests/resources/rest/access.log.ndjson'), 'actions.ndjson')
    res = await ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 20)

    await waitForFinalize(ax, 'restndjson')
    res = await ax.get('/api/v1/datasets/restndjson/lines')
    assert.equal(res.data.total, 20)
  })

  test('Send bulk requests in ndjson file and receive errors', async () => {
    const ax = testUser5
    await ax.post('/api/v1/datasets/restndjson', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('./tests/resources/rest/access.log.ndjson'), 'actions.ndjson')
    await assert.rejects(ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 20)
      assert.equal(err.data.nbOk, 0)
      return true
    })
  })

  test('Send bulk actions as a CSV body', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' },
        { key: 'attr3', type: 'boolean' },
        { key: 'attr4', type: 'string', format: 'date-time' }
      ]
    })
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1,attr2,attr3,attr4
line1,test1,test1,oui,2015-03-18T00:58:59Z
line2,test1,test1,non,
line3,test1,test1,true,`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[0].attr3, true)
    assert.equal(lines[0].attr4, '2015-03-18T00:58:59Z')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
    assert.equal(lines[1].attr2, 'test1')
    assert.equal(lines[1].attr3, false)
    assert.equal(lines[2].attr3, true)

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_action,_id,attr1,attr2
patch,line1,test2
update,line2,test2,test2`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 3)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line3')
    assert.equal(lines[1]._id, 'line1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test1')
    assert.equal(lines[2]._id, 'line2')
    assert.equal(lines[2].attr1, 'test2')
    assert.equal(lines[2].attr2, 'test2')

    // custom separator
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id;attr1;attr2;attr3;attr4
line3;test1;test1;oui;2015-03-18T00:58:59
line4;test1;test1;oui,2015-03-18T00:58:59`, { headers: { 'content-type': 'text/csv' }, params: { sep: ';' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 4)

    // type casting number -> string
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_action,_id,attr1,attr2
patch,line1,33`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 4)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '-_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, '33')
  })

  test('Send bulk actions as a CSV body with automatic adjustment of keys', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' }
      ]
    })
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `Attr1,Attr2
test1,test1
test2,test2`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test2')
  })

  test('Resend downloaded csv as bulk actions', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' }
      ]
    })
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `attr1,attr2
test1,test1
test2,test2
test3,test3`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 3)

    const csvLines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { format: 'csv' } })).data

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', csvLines, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restcsv')
    res = await ax.get('/api/v1/datasets/restcsv')
    assert.equal(res.data.count, 6)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 6)
  })

  test('Validate bulk actions sent as csv', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'boolean' }]
    })
    await assert.rejects(ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attrko
    line1,test1
    line2,test1
    line3,test1`, { headers: { 'content-type': 'text/csv' } }), (err: any) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 1)
      assert.equal(err.data.nbOk, 0)
      return true
    })
  })

  test('Send bulk actions as a gzipped CSV', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restgzcsv', {
      isRest: true,
      title: 'restgzcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restgzcsv/_bulk_lines', zlib.gzipSync(`_id,attr1,attr2
line1,test1,test1
line2,test1,test1`), { headers: { 'content-type': 'text/csv+gzip' } })
    await waitForFinalize(ax, 'restgzcsv')
    res = await ax.get('/api/v1/datasets/restgzcsv')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restgzcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  test('Send bulk as a .csv file', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', `_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`, 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restcsvfile')
    res = await ax.get('/api/v1/datasets/restcsvfile')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  test('Send bulk as a .csv file with other encoding', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'testé2', type: 'string' }]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', iconv.encode(`_id,attr1,testé2
    line1,test1,testé1
    line2,test1,testé1`, 'ISO-8859-1'), 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restcsvfile')
    res = await ax.get('/api/v1/datasets/restcsvfile')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0]['testé2'], 'testé1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
    assert.equal(lines[1]['testé2'], 'testé1')
  })

  test('Send bulk as a .csv.gz file', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsvgz', {
      isRest: true,
      title: 'restcsvgz',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', zlib.gzipSync(`_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`), 'actions.csv.gz')
    await ax.post('/api/v1/datasets/restcsvgz/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restcsvgz')
    res = await ax.get('/api/v1/datasets/restcsvgz')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvgz/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  test('Send bulk as a .xlsx file', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restxlsxfile', {
      isRest: true,
      title: 'restxlsxfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    const form = new FormData()
    form.append('actions', fs.readFileSync('./tests/resources/datasets/actions.xlsx'), 'actions.xlsx')
    await ax.post('/api/v1/datasets/restxlsxfile/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restxlsxfile')
    res = await ax.get('/api/v1/datasets/restxlsxfile')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restxlsxfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  test('Send bulk as a .ods file', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restodsfile', {
      isRest: true,
      title: 'restodsfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    const form = new FormData()
    form.append('actions', fs.readFileSync('./tests/resources/datasets/actions.xlsx'), 'actions.ods')
    await ax.post('/api/v1/datasets/restodsfile/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restodsfile')
    res = await ax.get('/api/v1/datasets/restodsfile')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restodsfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  test('Send bulk as a .zip file', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restcsvzip', {
      isRest: true,
      title: 'restcsvzip',
      schema: [{ key: 'id', type: 'string' }, { key: 'adr', type: 'string' }, { key: 'some date', type: 'string' }, { key: 'loc', type: 'string' }]
    })

    // Create a line with an attached file
    const form = new FormData()
    const actionsContent = fs.readFileSync('./tests/resources/datasets/dataset1.zip')
    form.append('actions', actionsContent, 'dataset1.zip')
    await ax.post('/api/v1/datasets/restcsvzip/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'restcsvzip')
    res = await ax.get('/api/v1/datasets/restcsvzip')
    assert.equal(res.data.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvzip/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].id, 'koumoul')
    assert.equal(lines[1].id, 'bidule')
  })

  test('Use the primary key defined by the user', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restkey', {
      isRest: true,
      title: 'restkey',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }],
      primaryKey: ['attr1', 'attr2']
    })
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', `attr1,attr2,attr3
test1,test1,test1
test2,test2,test2
test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restkey')
    res = await ax.get('/api/v1/datasets/restkey')
    assert.equal(res.data.count, 2)
    let lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    // lines 2 and 3 of the CSV has the same primary key, so 3 overwrote 2
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr3, 'test3')

    // updating the primary key of a line is not allowed
    await assert.rejects(ax.post('/api/v1/datasets/restkey/lines', { _id: lines[0]._id, attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err: any) => err.status === 400)
    await assert.rejects(ax.put('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err: any) => err.status === 400)
    await assert.rejects(ax.patch('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2' }), (err: any) => err.status === 400)

    // the primary key can also be used to delete lines
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', [
      { _action: 'delete', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'restkey')
    res = await ax.get('/api/v1/datasets/restkey')
    assert.equal(res.data.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test2')
    assert.equal(lines[0].attr3, 'test3')

    // the primary key can also be used in a csv body
    res = await ax.post('/api/v1/datasets/restkey/_bulk_lines', `_action,attr1,attr2,attr3
patch,test2,test2,test2
patch,test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    await waitForFinalize(ax, 'restkey')
    res = await ax.get('/api/v1/datasets/restkey')
    assert.equal(res.data.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr3, 'test3')
  })

  test('Perform CRUD operations in larger bulk and keep request alive', async () => {
    // TODO: requires pump utility - simplified non-streaming version
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'restlarge',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    const bulkLines = []
    for (let i = 0; i < 550; i++) {
      bulkLines.push({ attr1: 'test' + i })
    }
    const res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', bulkLines)
    assert.equal(res.data.nbOk, 550)
    await waitForFinalize(ax, 'rest2')
  })

  test('Use drop option to recreate all data', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restdrop', {
      isRest: true,
      title: 'restdrop',
      schema: [{ key: 'attr1', type: 'string' }]
    })

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test1-1' },
      { attr1: 'test1-2' }
    ])
    assert.equal(res.data.nbCreated, 2)
    await waitForFinalize(ax, 'restdrop')
    res = await ax.get('/api/v1/datasets/restdrop')
    assert.equal(res.data.count, 2)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test2-1' },
      { attr1: 'test2-2' }
    ])
    assert.equal(res.data.nbCreated, 2)
    await waitForFinalize(ax, 'restdrop')
    res = await ax.get('/api/v1/datasets/restdrop')
    assert.equal(res.data.count, 4)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test3-1' },
      { attr1: 'test3-2' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 2)
    assert.equal(res.data.dropped, true)
    await waitForFinalize(ax, 'restdrop')
    res = await ax.get('/api/v1/datasets/restdrop')
    assert.equal(res.data.count, 2)

    res = await ax.get('/api/v1/datasets/restdrop/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].attr1, 'test3-2')
    assert.equal(res.data.results[1].attr1, 'test3-1')

    await assert.rejects(ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attrko: 'ko' }
    ], { params: { drop: true } }), (res: any) => {
      assert.equal(res.status, 400)
      assert.equal(res.data.nbErrors, 1)
      assert.equal(res.data.cancelled, true)
      return true
    })

    res = await ax.get('/api/v1/datasets/restdrop')
    assert.equal(res.data.status, 'finalized')
    res = await ax.get('/api/v1/datasets/restdrop/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].attr1, 'test3-2')
    assert.equal(res.data.results[1].attr1, 'test3-1')
  })

  test('Specify a date-time format', async () => {
    const ax = await testUser4
    await ax.post('/api/v1/datasets/restdatetimeformat', {
      isRest: true,
      title: 'restdatetimeformat',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string', format: 'date-time', dateTimeFormat: 'D/M/YYYY H:m' }]
    })
    let res = await ax.post('/api/v1/datasets/restdatetimeformat/_bulk_lines', [
      { attr1: 'test1', attr2: moment().toISOString() },
      { attr1: 'test2', attr2: moment().format('D/M/YYYY H:m') },
      { attr1: 'test3', attr2: 'bad date' }
    ])
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.nbOk, 2)
    res = await ax.post('/api/v1/datasets/restdatetimeformat/_bulk_lines', `attr1,attr2
    test1,${moment().toISOString()}
    test2,${moment().format('D/M/YYYY H:m')}
    test2,bad date`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.nbOk, 2)

    await waitForFinalize(ax, 'restdatetimeformat')
    res = await ax.get('/api/v1/datasets/restdatetimeformat/lines')
    assert.equal(res.data.total, 4)
  })

  test('Send geometries in a column', async () => {
    const ax = await testUser4
    await ax.post('/api/v1/datasets/restgeo', {
      isRest: true,
      title: 'restgeo',
      projection: {
        title: 'RGF93 / Lambert-93 -- France',
        code: 'EPSG:2154'
      },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'geom', type: 'string', 'x-refersTo': 'http://data.ign.fr/def/geometrie#Geometry' }]
    })
    let res = await ax.post('/api/v1/datasets/restgeo/_bulk_lines', [
      { attr1: 'test1', geom: '{ "type": "LineString", "coordinates": [ [325393.494869902, 6811835.01781834], [325395.994869902, 6811844.39281834], [325419.119869902, 6811855.64281834], [325459.744869902, 6811870.33031834], [325481.932369902, 6811879.39281834], [325486.307369902, 6811880.64281834] ] }' },
      { attr1: 'test2', geom: '{ "type": "GeometryCollection", "geometries": [ { "type": "LineString", "coordinates": [ [251886.985899411, 6872275.12076354], [251888.207983521, 6872292.65793929], [251890.454033297, 6872315.5409094], [251893.697505195, 6872348.49231213], [251897.996450216, 6872384.52683849], [251902.294469564, 6872420.4468662], [251905.546270246, 6872454.42875726], [251907.873753365, 6872487.38756811], [251907.084788265, 6872517.27992072], [251901.258807214, 6872547.32749661], [251894.484448846, 6872573.37504226], [251889.755334072, 6872597.45945851], [251885.973671495, 6872625.42941052], [251887.181830399, 6872647.40473083], [251887.238278007, 6872654.389118], [251893.458715313, 6872687.31646898], [251897.732675134, 6872720.25955157], [251891.971467897, 6872758.32200672], [251884.296849522, 6872786.32343173], [251873.547421706, 6872816.41081373], [251862.797994124, 6872846.49819645], [251852.964554994, 6872876.5781754], [251845.313972946, 6872907.55651933], [251841.565590256, 6872939.64837115], [251840.776593724, 6872969.54069748], [251841.027337844, 6873000.56967491], [251841.285483951, 6873032.51463835], [251842.590772488, 6873066.51223829], [251846.864700741, 6873099.45528939], [251855.015855714, 6873130.42040544], [251861.21289813, 6873146.28658343], [251871.416702807, 6873176.20455713], [251883.681486305, 6873206.10587101], [251894.915780783, 6873236.0155157], [251906.150076806, 6873265.92516287], [251916.337228979, 6873293.78217276], [251925.60839308, 6873321.64658783], [251935.796471473, 6873349.61809837], [251942.787472665, 6873362.85660362], [251951.029897685, 6873378.46486731], [251966.271651947, 6873408.34212008], [251978.421015621, 6873438.12986611], [251985.647858976, 6873468.07191121], [251986.968881389, 6873504.01598985], [251988.28250165, 6873539.04408456], [251990.47140027, 6873569.02685801], [251993.788631782, 6873596.93940997], [251998.022778802, 6873624.95905592], [252006.173015829, 6873655.80968568], [252017.448029793, 6873690.75725799], [252024.094982038, 6873709.40811596], [252029.126325925, 6873722.82271812], [252036.882300944, 6873743.50174934], [252052.13979177, 6873775.32547793], [252070.390906839, 6873809.18610815], [252082.590932125, 6873831.07256452], [252090.480126886, 6873845.76460332], [252100.843182767, 6873865.06371057], [252110.03272217, 6873882.83628304], [252126.182150155, 6873911.67565717], [252135.357094337, 6873927.63227624], [252150.614590488, 6873959.45600805], [252163.811108951, 6873991.29640142], [252173.13132361, 6874025.22923321], [252183.375856857, 6874060.18514446], [252195.664714348, 6874093.06342843], [252202.777756918, 6874108.92221209], [252219.957679963, 6874137.75325941], [252241.682980772, 6874164.8834733], [252263.565365797, 6874192.65364785], [252281.389790307, 6874214.43235223], [252287.46375213, 6874221.85380003], [252298.928741773, 6874239.37777259], [252311.690573148, 6874260.9289564], [252325.25615508, 6874289.34105774], [252339.370096775, 6874319.76796773], [252353.588787362, 6874350.56955371], [252367.791747661, 6874379.42467008], [252381.087045808, 6874409.31767562], [252389.443896974, 6874427.98046355], [252395.372853403, 6874441.96888135], [252398.367964532, 6874449.03536392], [252403.49091416, 6874461.12213874], [252415.755724498, 6874491.02347714], [252424.912410513, 6874518.88884056], [252431.510563666, 6874542.78150156], [252435.505952542, 6874557.24925702], [252438.465872452, 6874580.72685041], [252445.725119802, 6874614.67635807], [252458.929980478, 6874647.54722994], [252467.074443767, 6874663.51216863], [252485.300599497, 6874694.28132538], [252505.564603497, 6874722.17136023], [252524.674366844, 6874748.92567038], [252544.938386935, 6874776.81570464], [252563.164569337, 6874807.58497282], [252571.30904047, 6874823.54991241], [252587.597061948, 6874855.36529604], [252600.793610037, 6874887.20568067], [252612.052004885, 6874920.09228968], [252617.211177155, 6874935.05082311], [252627.431678207, 6874967.02977993], [252637.651255455, 6874998.8942415], [252644.854070294, 6875025.85935256], [252655.220533292, 6875061.73032863], [252662.463137159, 6875093.61886512], [252664.603308603, 6875109.6967545], [252667.167607214, 6875128.96086826], [252670.178855316, 6875156.61031997], [252674.230461596, 6875189.4795401], [252676.451765304, 6875223.46979224], [252676.580384875, 6875239.38505543], [252675.335833968, 6875253.56119686], [252673.854171856, 6875270.43816901], [252666.081673118, 6875300.50154046], [252657.408911944, 6875332.51879142], [252646.699225605, 6875367.52966627], [252634.959972342, 6875402.6633739], [252623.212390384, 6875436.7665976], [252617.403713765, 6875454.7909825], [252605.671860796, 6875490.84067899], [252594.970498466, 6875526.88204296], [252590.08614101, 6875545.92950646], [252585.307949771, 6875563.94544358], [252575.645416074, 6875601.00896002], [252566.898873351, 6875638.06507005], [252557.228010284, 6875674.0981036], [252552.327001181, 6875691.08459867], [252544.603544958, 6875727.21639118], [252535.954842816, 6875762.21060472], [252534.395648435, 6875769.61397606], [252527.801991161, 6875800.92199802], [252525.39135374, 6875815.31219349], [252517.650313003, 6875849.26849536], [252511.849277273, 6875882.40757456], [252510.152625412, 6875913.33786255], [252512.324882625, 6875941.259723], [252516.542391837, 6875967.21844766], [252521.831106012, 6875998.20677254], [252525.074567948, 6876031.15822898], [252525.308669322, 6876060.12631231], [252522.53341018, 6876085.11102108], [252516.781175844, 6876110.11979557], [252501.026122175, 6876144.25540159], [252476.283699078, 6876171.47880896], [252459.351956873, 6876187.53200373], [252434.575661597, 6876208.95247906], [252430.64277767, 6876219.82573704], [252426.018841911, 6876234.17384312] ] }, { "type": "LineString", "coordinates": [ [250482.964576462, 6870975.61931764], [250486.963960431, 6870975.65004874], [250495.364785618, 6870975.39609193], [250513.812313618, 6870975.31557822], [250532.265054069, 6870975.1514928], [250540.930700373, 6870975.32850029], [250555.095813778, 6870975.65535817], [250559.943268555, 6870975.81623879], [250592.789706974, 6870977.95338066], [250613.683897067, 6870980.06038268], [250636.228202773, 6870982.99218225], [250650.887447279, 6870985.26886848], [250680.835492191, 6870990.22028911], [250716.247257768, 6870997.39844017], [250851.217300066, 6871029.87604536] ] }, { "type": "LineString", "coordinates": [ [248798.825510552, 6871121.45207027], [248835.313792437, 6871136.59720436], [248865.526277177, 6871140.90293807], [248897.892279304, 6871144.95177387], [248930.054109891, 6871150.39202404], [248963.977986423, 6871154.12564013], [248982.978646847, 6871153.90184715], [249011.418997978, 6871155.99745822], [249041.661832606, 6871157.30355372], [249068.541509103, 6871158.11989758], [249112.716830259, 6871155.92151653], [249136.730355083, 6871154.72648486], [249156.899580066, 6871151.53602083], [249190.85750675, 6871145.3073576], [249222.754483107, 6871139.09527445], [249252.696648247, 6871131.86846456], [249278.647104487, 6871126.62047274], [249297.621458746, 6871122.45945392], [249329.50178278, 6871114.18645614], [249357.391322973, 6871108.00675525], [249386.311305014, 6871101.81880049], [249417.622001399, 6871092.76745236], [249456.307640457, 6871083.66939707], [249482.355831971, 6871077.51583773], [249506.60376239, 6871072.41038808], [249561.943091033, 6871060.22741031], [249594.156043133, 6871052.72933452], [249621.617628532, 6871052.675908], [249651.568116559, 6871046.47961968], [249685.526037639, 6871040.25086983], [249715.483990321, 6871034.97048225], [249740.41226149, 6871030.76133987], [249770.395111076, 6871028.57244818], [249804.270002804, 6871026.23758178], [249835.283357574, 6871024.04034626], [249863.22098093, 6871023.81456135], [249897.218697885, 6871022.50924967], [249929.163766737, 6871022.25107595], [249958.131878516, 6871022.0169607], [249993.160080026, 6871020.70331815], [250024.058909787, 6871018.50697522], [250053.124872723, 6871016.21102072], [250082.16715417, 6871007.03623455], [250100.23696169, 6871004.82307282], [250118.961227804, 6871001.83992318], [250149.784964103, 6870996.92908554], [250181.011050597, 6870992.02569036], [250213.798078532, 6870988.40155632], [250224.925184747, 6870987.75789938], [250241.594031121, 6870986.88330928], [250270.416749361, 6870985.49416866], [250317.806821082, 6870982.93715176], [250409.728941233, 6870978.66389592], [250420.814244741, 6870978.02677555], [250447.597146191, 6870976.72042355], [250455.978578474, 6870976.09595916], [250459.975422124, 6870975.9501544] ] }, { "type": "LineString", "coordinates": [ [248180.064829366, 6873536.74967002], [248179.270001317, 6873528.29729637], [248186.504709663, 6873481.4127934], [248193.351365934, 6873447.72210991], [248194.39978367, 6873416.17203158], [248183.418216271, 6873379.76616466], [248181.689776662, 6873359.44736502], [248190.526533293, 6873323.92447848], [248200.641483771, 6873285.26286343], [248208.973578935, 6873251.82911482], [248219.041107293, 6873182.83475485], [248223.991476789, 6873151.77796454], [248226.491462532, 6873114.37993433], [248230.338359383, 6873081.91330731], [248233.815719109, 6873067.85255778], [248240.915557565, 6873052.63583439], [248254.613439841, 6873028.58318991], [248275.463370961, 6872995.83031246], [248307.115917654, 6872945.00354475], [248326.955149527, 6872916.1689367], [248345.289585876, 6872884.83337041], [248406.410021412, 6872780.75783496], [248454.067700671, 6872710.51185802], [248471.327658113, 6872685.08681802], [248482.653444016, 6872667.26939196], [248490.857697546, 6872650.25933065], [248498.523603483, 6872631.16811252], [248505.928902565, 6872612.07892964], [248516.119763725, 6872579.09709074], [248535.940341992, 6872505.67415159], [248542.31436333, 6872484.26816919], [248549.70660718, 6872449.71303822], [248551.037049899, 6872415.08996528], [248548.633962395, 6872380.5151272], [248549.978815249, 6872353.39403397], [248565.061694209, 6872219.806538], [248565.522129559, 6872202.01853135], [248565.623262301, 6872183.40759116], [248563.598332502, 6872163.36378052], [248556.861870102, 6872108.3039549], [248549.020537597, 6872073.43690576], [248544.89383235, 6872046.62072266], [248544.191523349, 6872024.20834133], [248553.220421113, 6871915.69458807], [248559.530501442, 6871890.09751228], [248567.198504149, 6871871.26690377], [248577.450266687, 6871849.548072], [248596.509468159, 6871820.98047729], [248671.420226669, 6871712.45154281], [248681.420149127, 6871697.86799264], [248700.992578941, 6871670.77621077], [248724.803501554, 6871632.51846942], [248736.066095049, 6871606.88137673], [248741.070600324, 6871581.03416936], [248742.680549296, 6871554.43218108], [248742.191623085, 6871461.6360634], [248743.316950618, 6871404.29285273], [248743.84936213, 6871360.75492275], [248744.579977723, 6871208.76222593], [248747.530464205, 6871184.97567841], [248751.738323605, 6871170.59534924], [248757.06210016, 6871158.75761141], [248771.094142153, 6871147.21088024] ] }, { "type": "Point", "coordinates": [248758.476399985, 6871130.30873396] } ] }' }
    ])
    assert.equal(res.data.nbOk, 2)

    await waitForFinalize(ax, 'restgeo')
    res = await ax.get('/api/v1/datasets/restgeo/lines?select=attr1,geom,_geopoint,_geocorners')
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geocorners)
    assert.ok(res.data.results[1]._geopoint)
    assert.ok(res.data.results[1]._geocorners)
  })
})
