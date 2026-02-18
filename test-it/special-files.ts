import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset, formHeaders } from './utils/index.ts'
import fs from 'fs-extra'
import path from 'node:path'
import * as workers from '@data-fair/data-fair-api/src/workers/index.ts'
import FormData from 'form-data'
import moment from 'moment'
import 'moment-timezone'
import * as xlsx from '../api/src/misc/utils/xlsx.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

const localeTimeZone = moment.tz.guess()

describe('Many case of special file datasets', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should extract a zipped csv file', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.zip', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.zip')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a zipped geojson file', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('geo/geojson-example.zip', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.zip')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  it('should extract a gzipped csv file', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv.gz', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.csv.gz')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a gzipped file on PUT and replace it', async function () {
    const ax = dmeadus
    const gzippedContent = fs.readFileSync(path.resolve('./test-it/resources/datasets/dataset1.csv.gz'))
    const form = new FormData()
    form.append('file', gzippedContent, 'dataset1.csv.gz')
    await ax.put('/api/v1/datasets/dataset-compressed', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))

    const schema = dataset.schema.filter(p => !p['x-calculated'])
    const locProp = schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    const csvContent = fs.readFileSync(path.resolve('./test-it/resources/datasets/dataset1.csv'))
    const form2 = new FormData()
    form2.append('file', csvContent, 'dataset1.csv')
    form2.append('schema', JSON.stringify(schema))
    await ax.put('/api/v1/datasets/dataset-compressed', form2, { headers: formHeaders(form2) })
    dataset = await workers.hook('finalize/dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))
    assert.ok(dataset.bbox)
  })

  it('should extract a gzipped geojson file', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('geo/geojson-example.geojson.gz', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.geojson.gz')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  it('Upload dataset in iCalendar format', async function () {
    const ax = dmeadus
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

  it('Upload dataset in iCalendar format with X-WR-TIMEZONE param', async function () {
    const ax = dmeadus
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

  it('Upload dataset in iCalendar format with VTIMEZONE param', async function () {
    const ax = dmeadus
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

  it('Upload dataset with recurring event', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('calendar/calendar-rrule.ics', ax)
    assert.equal(dataset.count, 92)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=DTSTART`)
    assert.ok(res.data.results[0].DTSTART.startsWith('2008-'))
    assert.ok(res.data.results[1].DTSTART.startsWith('2009-'))
    assert.ok(res.data.results[2].DTSTART.startsWith('2010-'))
  })

  it('Process uploaded json dataset', async function () {
    // Send dataset
    const form = new FormData()
    form.append('file', JSON.stringify([{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }]), 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
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

  it('Process uploaded ndjson dataset', async function () {
    // Send dataset
    const form = new FormData()
    form.append('file', [{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }].map(o => JSON.stringify(o)).join('\n'), 'example.ndjson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
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

  it('Fails when json root is not an array', async function () {
    const form = new FormData()
    form.append('file', JSON.stringify({ col1: 'val1' }), 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err: any) => err.message.includes('expect an array'))
  })

  it('Fails when json is invalid', async function () {
    const form = new FormData()
    form.append('file', "{ col1: 'val1' }", 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err: any) => err.message.includes('Unexpected'))
  })

  const checkDateDataset = async (ext) => {
    const ax = dmeadus
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

  it('should manage CSV file created by Libre Office with date col', async function () {
    await checkDateDataset('csv')
  })

  it('should manage ODS file created by Libre Office with date col', async function () {
    await checkDateDataset('ods')
  })

  it('should manage XLSX file created by Libre Office with date col', async function () {
    await checkDateDataset('xlsx')
  })

  it('should manage XLSX file create by excel', async function () {
    const dates = []
    for await (const lines of xlsx.iterCSV('./test-it/resources/datasets/Les aides financières ADEME.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[2])
      }
    }
    assert.equal(dates[1], '2019-03-20')
    assert.equal(dates[2], '2018-04-05')
  })

  it('should manage another XLSX file created by excel', async function () {
    const dates = []
    for await (const lines of xlsx.iterCSV('./test-it/resources/datasets/date-time.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[1])
      }
    }
    assert.equal(dates[1], '2050-01-01T00:00:00.000Z')
    assert.equal(dates[2], '2050-01-01T01:00:00.000Z')
  })

  it('should manage a sparse XLSX file', async function () {
    const ax = dmeadus
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

  it('should manage a XLSX with formula and links', async function () {
    const ax = dmeadus
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

  it('should manage a ODS file with normalization options', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/header.ods')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    assert.equal(dataset.schema.filter(p => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })

  it('should manage a XLSX file with normalization options', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/header.xlsx')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    assert.equal(dataset.schema.filter(p => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })
})
