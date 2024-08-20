const assert = require('assert').strict
const workers = require('../server/workers')

describe('REST datasets exported', () => {
  it('Configure automatic export of CSV file from REST dataset', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/rest', {
      isRest: true,
      title: 'rest',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('datasetStateManager/rest')
    await ax.post('/api/v1/datasets/rest/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1' },
      { attr1: 'test2', attr2: 'test2' }
    ])
    await workers.hook('datasetStateManager/rest')
    const patched = (await ax.patch('/api/v1/datasets/rest', { exports: { restToCSV: { active: true } } })).data
    assert.ok(!!patched.exports.restToCSV.nextExport)

    // force change of nextExport date to trigger worker
    const nextExport = new Date().toISOString()
    await global.db.collection('datasets').updateOne(
      { id: 'rest' }, { $set: { 'exports.restToCSV.nextExport': nextExport } })
    // console.log(await global.db.collection('datasets').findOne({ id: 'rest' }))

    const dataset = await workers.hook('restExporterCSV/rest')
    assert.ok(!!dataset.exports.restToCSV.lastExport)
    assert.ok(dataset.exports.restToCSV.nextExport !== nextExport)
    const exportedDataFile = dataset.storage.dataFiles.find(df => df.key === 'export-csv')
    assert.ok(exportedDataFile)
    assert.equal(exportedDataFile.size, 48)
    assert.equal(dataset.storage.size, exportedDataFile.size + dataset.storage.collection.size)
    assert.equal(dataset.storage.indexed.size, dataset.storage.collection.size)

    const dataFiles = (await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)).data
    assert.equal(dataFiles.length, 1)
    const csv = (await ax.get(dataFiles[0].url)).data
    assert.equal(csv.trim(), `
"attr1","attr2"
"test1","test1"
"test2","test2"`.trim())

    // same content but fresh as a superadmin
    await ax.post('/api/v1/datasets/rest/_bulk_lines', [
      { attr1: 'test3', attr2: 'test3' }
    ])
    await workers.hook('datasetStateManager/rest')

    await assert.rejects(ax.get('/api/v1/datasets/rest/raw'), err => err.status === 404)

    const freshCSV = (await global.ax.superadmin.get('/api/v1/datasets/rest/raw')).data
    const lines = freshCSV.split('\n')
    assert.equal(lines[0], '"_id","attr1","attr2"')
    assert.ok(lines[3].endsWith(',"test3","test3"'))
  })
})
