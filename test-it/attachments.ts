import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, cdurning2, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

describe('Attachments', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process newly uploaded attachments alone', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)
    assert.equal(dataset.status, 'created')

    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook(`normalizeFile/${dataset.id}`)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'files.csv')

    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { highlight: '_file.content', q: 'test' }
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find((item: any) => item.file === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.status, 200)
  })

  it('Process newly uploaded attachments along with data file', async function () {
    const ax = cdurning2

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)

    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
  })
})
