import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const require = createRequire(import.meta.url)
const XLSX = require('@e965/xlsx')

const MAX = 32767
const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('xlsx export - cell limit', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('truncates over-long cells in xlsx and notes it in metadata, keeps ods intact', async () => {
    const ax = testUser1
    const big = 'x'.repeat(MAX + 5000)
    await ax.post('/api/v1/datasets/cell-limit', {
      isRest: true,
      title: 'cell limit',
      schema: [{ key: 'label', type: 'string' }, { key: 'big', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/cell-limit/lines', { label: 'a', big })
    await waitForFinalize(ax, 'cell-limit')

    // xlsx: 200, data cell truncated to the limit, metadata note present
    const xlsxRes = await ax.get('/api/v1/datasets/cell-limit/lines?format=xlsx', { responseType: 'arraybuffer' })
    assert.equal(xlsxRes.status, 200)
    const wb = XLSX.read(Buffer.from(xlsxRes.data), { type: 'buffer' })
    const dataRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    // header row 0: ['label','big']; first data row 1; 'big' is column index 1
    assert.equal(dataRows[1][1].length, MAX)
    const metaRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 })
    const truncatedRow = metaRows.find((r) => r[0] === 'truncated')
    assert.ok(truncatedRow, 'metadata sheet should contain a "truncated" row')
    assert.ok(truncatedRow[2].includes('big'), 'note should mention the affected column')

    // ods: 200, full value preserved (no per-cell limit)
    const odsRes = await ax.get('/api/v1/datasets/cell-limit/lines?format=ods', { responseType: 'arraybuffer' })
    assert.equal(odsRes.status, 200)
    const odsWb = XLSX.read(Buffer.from(odsRes.data), { type: 'buffer' })
    const odsRows = XLSX.utils.sheet_to_json(odsWb.Sheets[odsWb.SheetNames[0]], { header: 1 })
    assert.equal(odsRows[1][1].length, MAX + 5000)
    const odsMeta = XLSX.utils.sheet_to_json(odsWb.Sheets[odsWb.SheetNames[1]], { header: 1 })
    assert.ok(!odsMeta.find((r) => r[0] === 'truncated'), 'ods must not get a truncation note')
  })
})
