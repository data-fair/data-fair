import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as xlsx from '../../../../api/src/misc/utils/xlsx.ts'

test.describe('XLSX parsing', () => {
  test('should manage XLSX file created by excel', async () => {
    const dates: string[] = []
    for await (const lines of xlsx.iterCSV('./tests/resources/datasets/Les aides financières ADEME.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[2])
      }
    }
    assert.equal(dates[1], '2019-03-20')
    assert.equal(dates[2], '2018-04-05')
  })

  test('should manage another XLSX file created by excel', async () => {
    const dates: string[] = []
    for await (const lines of xlsx.iterCSV('./tests/resources/datasets/date-time.xlsx')) {
      for (const line of lines.split('\n')) {
        dates.push(line.split(',')[1])
      }
    }
    assert.equal(dates[1], '2050-01-01T00:00:00.000Z')
    assert.equal(dates[2], '2050-01-01T01:00:00.000Z')
  })
})
