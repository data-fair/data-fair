import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import FormData from 'form-data'
import moment from 'moment'
import 'moment-timezone'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const localeTimeZone = moment.tz.guess()

test.describe('Many case of special file datasets', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should extract a zipped csv file', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.zip', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.zip')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.schema[0].key, 'id')
  })

  test('should extract a zipped geojson file', async () => {
    const ax = testUser1
    const dataset = await sendDataset('geo/geojson-example.zip', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.zip')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  test('should extract a gzipped csv file', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv.gz', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.csv.gz')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.schema[0].key, 'id')
  })

  test('should extract a gzipped file on PUT and replace it', async () => {
    const ax = testUser1
    const gzippedContent = fs.readFileSync(path.resolve('./tests/resources/datasets/dataset1.csv.gz'))
    const form = new FormData()
    form.append('file', gzippedContent, 'dataset1.csv.gz')
    await ax.put('/api/v1/datasets/dataset-compressed', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, 'dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))

    const schema = dataset.schema.filter(p => !p['x-calculated'])
    const locProp = schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    const csvContent = fs.readFileSync(path.resolve('./tests/resources/datasets/dataset1.csv'))
    const form2 = new FormData()
    form2.append('file', csvContent, 'dataset1.csv')
    form2.append('schema', JSON.stringify(schema))
    await ax.put('/api/v1/datasets/dataset-compressed', form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    dataset = await waitForFinalize(ax, 'dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))
    assert.ok(dataset.bbox)
  })

  test('should extract a gzipped geojson file', async () => {
    const ax = testUser1
    const dataset = await sendDataset('geo/geojson-example.geojson.gz', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.geojson.gz')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  test('Upload dataset in iCalendar format', async () => {
    const ax = testUser1
    const dataset = await sendDataset('calendar/calendar.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, localeTimeZone)
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
    assert.equal(moment(res.data.results[0].DTEND).format('YYYY-MM-DD-HH:mm'), '2008-02-14-00:00')
  })

  test('Upload dataset in iCalendar format with X-WR-TIMEZONE param', async () => {
    const ax = testUser1
    const dataset = await sendDataset('calendar/calendar-xwr-timezone.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, 'America/New_York')
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).tz('America/New_York').format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
  })

  test('Upload dataset in iCalendar format with VTIMEZONE param', async () => {
    const ax = testUser1
    const dataset = await sendDataset('calendar/calendar-vtimezone.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, 'America/Los_Angeles')
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).tz('America/Los_Angeles').format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
  })

  test('Upload dataset with recurring event', async () => {
    const ax = testUser1
    const dataset = await sendDataset('calendar/calendar-rrule.ics', ax)
    assert.equal(dataset.count, 92)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=DTSTART`)
    assert.ok(res.data.results[0].DTSTART.startsWith('2008-'))
    assert.ok(res.data.results[1].DTSTART.startsWith('2009-'))
    assert.ok(res.data.results[2].DTSTART.startsWith('2010-'))
  })

  test('Process uploaded json dataset', async () => {
    // Send dataset
    const form = new FormData()
    form.append('file', JSON.stringify([{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }]), 'example.json')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].col1, 'val1')

    const dataFiles = (await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)).data
    assert.equal(dataFiles.length, 2)
    assert.equal(dataFiles[0].name, 'example.json')
    assert.equal(dataFiles[1].name, 'example.csv')
    const csv = (await ax.get(dataFiles[1].url)).data
    assert.equal(csv, `"col1","col2"
"val1",1
"val2",2
`)
  })

  test('Process uploaded ndjson dataset', async () => {
    // Send dataset
    const form = new FormData()
    form.append('file', [{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }].map(o => JSON.stringify(o)).join('\n'), 'example.ndjson')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].col1, 'val1')

    const dataFiles = (await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)).data
    console.log(dataFiles)
    assert.equal(dataFiles.length, 2)
    assert.equal(dataFiles[0].name, 'example.ndjson')
    assert.equal(dataFiles[1].name, 'example.csv')
    const csv = (await ax.get(dataFiles[1].url)).data
    assert.equal(csv, `"col1","col2"
"val1",1
"val2",2
`)
  })

  test('Fails when json root is not an array', async () => {
    const form = new FormData()
    form.append('file', JSON.stringify({ col1: 'val1' }), 'example.json')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await waitForDatasetError(ax, dataset.id)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('expect an array'))
  })

  test('Fails when json is invalid', async () => {
    const form = new FormData()
    form.append('file', "{ col1: 'val1' }", 'example.json')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await waitForDatasetError(ax, dataset.id)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('Unexpected'))
  })

  const checkDateDataset = async (ext) => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dates.' + ext, ax)
    assert.ok(dataset.schema.find(p => p.key === 'colstr'))
    const coldate = dataset.schema.find(p => p.key === 'coldate')
    assert.ok(coldate)
    assert.equal(coldate.type, 'string')
    assert.equal(coldate.format, 'date')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0].coldate, '2020-12-04')
    assert.equal(res.data.results[1].coldate, '2020-12-05')
    assert.equal(res.data.results[2].coldate, '2020-12-20')
  }

  test('should manage CSV file created by Libre Office with date col', async () => {
    await checkDateDataset('csv')
  })

  test('should manage ODS file created by Libre Office with date col', async () => {
    await checkDateDataset('ods')
  })

  test('should manage XLSX file created by Libre Office with date col', async () => {
    await checkDateDataset('xlsx')
  })

  // XLSX date parsing tests moved to xlsx.unit.spec.ts

  test('should manage a sparse XLSX file', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/sparse.xlsx', ax)
    assert.equal(dataset.schema.filter(p => p.key.startsWith('col')).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 4)
    assert.equal(res.data.results[0].col1, 'a')
    assert.equal(res.data.results[1].col1, 'd')
    assert.equal(res.data.results[1].col2, 'e')
    assert.equal(res.data.results[2].col1, 'f')
    assert.equal(res.data.results[2].col3, 'g')
    assert.equal(res.data.results[3].col1, 'h')
    assert.equal(res.data.results[2].col5, 'i')
  })

  test('should manage a XLSX with formula and links', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/misc.xlsx', ax)
    assert.equal(dataset.schema.find(p => p.key === 'col1').type, 'integer')
    assert.equal(dataset.schema.find(p => p.key === 'col2').type, 'integer')
    assert.equal(dataset.schema.find(p => p.key === 'col3').type, 'string')
    assert.equal(dataset.schema.find(p => p.key === 'col4').type, 'integer')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 4)
    assert.equal(res.data.results[0].col1, 1)
    assert.equal(res.data.results[0].col2, 2)
    assert.equal(res.data.results[0].col3, 'https://koumoul.com/')
    assert.equal(res.data.results[0].col4, 3)
  })

  test('should manage a ODS file with normalization options', async () => {
    const ax = testUser1
    const datasetFd = fs.readFileSync('./tests/resources/datasets/header.ods')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.schema.filter(p => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })

  test('should manage a XLSX file with normalization options', async () => {
    const ax = testUser1
    const datasetFd = fs.readFileSync('./tests/resources/datasets/header.xlsx')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.schema.filter(p => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })
})
