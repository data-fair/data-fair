const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Spreadsheets conversions', () => {
  const checkDateDataset = async (ext) => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dates.' + ext, ax)
    assert.ok(dataset.schema.find(p => p.key === 'colstr'))
    const coldate = dataset.schema.find(p => p.key === 'coldate')
    assert.ok(coldate)
    assert.equal(coldate.type, 'string')
    assert.equal(coldate.format, 'date')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].coldate, '2020-12-04')
    assert.equal(res.data.results[1].coldate, '2020-12-05')
  }

  it('should manage CSV file created by Libre Office with date col', async () => {
    await checkDateDataset('csv')
  })
  it('should manage ODS file created by Libre Office with date col', async () => {
    await checkDateDataset('ods')
  })
  it('should manage XLSX file created by Libre Office with date col', async () => {
    await checkDateDataset('xlsx')
  })
})
