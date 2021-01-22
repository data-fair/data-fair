const assert = require('assert').strict
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('Date formats', () => {
  it('Detect and parse usual french date formats', async function() {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter(f => !f['x-calculated']).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0].date, '2021-01-13')
    assert.equal(res.data.results[0].datefr, '2021-01-13')
    assert.equal(res.data.results[0].datetime, '2021-01-13T19:42:02.790Z')
    assert.ok(res.data.results[0].datetimefr.startsWith('2021-01-13T'))

    assert.equal(res.data.results[2].date, '2021-01-15')
    assert.equal(res.data.results[2].datefr, '2021-01-15')
    assert.equal(res.data.results[2].datetime, '2021-01-15T19:42:02.790Z')
    assert.ok(res.data.results[2].datetimefr.startsWith('2021-01-15T'))
  })

  it('Detect ISO date in a version of the file, then update format in next version', async function() {
    const ax = global.ax.dmeadus
    let form = new FormData()
    form.append('file', 'str,date\nstrval,2021-01-22', 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    let dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, undefined)

    form = new FormData()
    form.append('file', 'str,date\nstrval,28/11/1983', 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook(`finalizer/${res.data.id}`)
    dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    // date input formatting does not belong to dataset.schema, but only dataset.file.schema
    dateProp = dataset.schema.find(p => p.key === 'date')
    assert.equal(dateProp.dateFormat, undefined)
  })
})
