const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('Attachments', () => {
  it('Process newly uploaded attachments alone', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)
    assert.equal(dataset.status, 'uploaded')

    // dataset converted
    dataset = await workers.hook(`converter/${dataset.id}`)
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.file.name, 'files.csv')

    // ES indexation and finalization
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { select: 'file,_file.content', highlight: '_file.content', q: 'test' },
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find(item => item.file === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
  })

  it('Process newly uploaded attachments along with data file', async () => {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' },
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find(item => item.attachment === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
  })

  it('Detect wrong attachment path', async () => {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments-wrong-paths.csv'), 'attachments-wrong-paths.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    try {
      await workers.hook(`finalizer/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.ok(err.message.includes('une colonne semble contenir des chemins'))
      assert.ok(err.message.includes('Valeurs invalides : BADFILE.txt'))
    }
  })

  it('Detect missing attachment paths', async () => {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments-no-paths.csv'), 'attachments-no-paths.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    try {
      await workers.hook(`finalizer/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.ok(err.message.includes('aucune colonne ne contient les chemins'))
      assert.ok(err.message.includes('Valeurs attendues : test.odt, dir1/test.pdf'))
    }
  })
})
