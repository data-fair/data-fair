import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import * as xlsx from '../api/src/misc/utils/xlsx.ts'

describe('Spreadsheets conversions', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  const checkDateDataset = async (ext: string) => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dates.' + ext, ax)
    assert.ok(dataset.schema.find((p: any) => p.key === 'colstr'))
    const coldate = dataset.schema.find((p: any) => p.key === 'coldate')
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
    const dates: string[] = []
    for await (const lines of xlsx.iterCSV('./test-it/resources/datasets/Les aides financières ADEME.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[2])
      }
    }
    assert.equal(dates[1], '2019-03-20')
    assert.equal(dates[2], '2018-04-05')
  })

  it('should manage another XLSX file created by excel', async function () {
    const dates: string[] = []
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
    assert.equal(dataset.schema.filter((p: any) => p.key.startsWith('col')).length, 4)
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
    assert.equal(dataset.schema.find((p: any) => p.key === 'col1').type, 'integer')
    assert.equal(dataset.schema.find((p: any) => p.key === 'col2').type, 'integer')
    assert.equal(dataset.schema.find((p: any) => p.key === 'col3').type, 'string')
    assert.equal(dataset.schema.find((p: any) => p.key === 'col4').type, 'integer')
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
    const workers = await import('../api/src/workers/index.ts')
    const fs = await import('node:fs')
    const FormData = (await import('form-data')).default
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/header.ods')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    assert.equal(dataset.schema.filter((p: any) => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })

  it('should manage a XLSX file with normalization options', async function () {
    const ax = dmeadus
    const workers = await import('../api/src/workers/index.ts')
    const fs = await import('node:fs')
    const FormData = (await import('form-data')).default
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/header.xlsx')
    const form = new FormData()
    form.append('file', datasetFd, 'header.ods')
    form.append('file_normalizeOptions', JSON.stringify({
      spreadsheetWorksheetIndex: 2,
      spreadsheetHeaderLine: 3,
      spreadsheetStartCol: 2
    }))

    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    assert.equal(dataset.schema.filter((p: any) => !p['x-calculated']).length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'val1')
  })
})
