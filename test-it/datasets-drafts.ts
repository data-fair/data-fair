import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

describe('datasets in draft mode', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('create new dataset in draft mode and validate it', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('analyzeCsv/' + res.data.id)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.file, undefined)
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.ok(dataset.draft.originalFile)
    assert.ok(dataset.draft.file)
    assert.equal(dataset.draft.status, 'analyzed')
    assert.equal(dataset.schema.length, 0)
    assert.equal(dataset.draft.schema.length, 6)

    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.equal(dataset.draft.count, 2)

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.draft, undefined)
    assert.equal(dataset.draftReason.key, 'file-new')
  })
})
