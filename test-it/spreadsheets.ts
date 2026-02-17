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
    for await (const lines of xlsx.iterCSV('./test/resources/datasets/Les aides financières ADEME.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[2])
      }
    }
    assert.equal(dates[1], '2019-03-20')
    assert.equal(dates[2], '2018-04-05')
  })

  it('should manage another XLSX file created by excel', async function () {
    const dates: string[] = []
    for await (const lines of xlsx.iterCSV('./test/resources/datasets/date-time.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[1])
      }
    }
    assert.equal(dates[1], '2050-01-01T00:00:00.000Z')
    assert.equal(dates[2], '2050-01-01T01:00:00.000Z')
  })
})
