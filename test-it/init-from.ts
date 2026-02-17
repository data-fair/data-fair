import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'
import path from 'node:path'

describe('Datasets with auto-initialization from another one', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Create REST dataset with copied information from file dataset', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.file.schema[2].dateFormat, 'D/M/YYYY')
    assert.equal(dataset.file.schema[3].dateTimeFormat, 'D/M/YYYY H:m')

    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/avatar.jpeg')), 'avatar.jpeg')
    await ax.post(`/api/v1/datasets/${dataset.id}/metadata-attachments`, attachmentForm, { headers: { 'Content-Length': attachmentForm.getLengthSync(), ...attachmentForm.getHeaders() } })

    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'A description', attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    const initFromDataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(initFromDataset.schema[0].key, 'date')
    assert.equal(initFromDataset.schema[2].key, 'date_fr')
    assert.equal(initFromDataset.schema[2]['x-originalName'], 'date fr')
    assert.equal(initFromDataset.schema[2].dateFormat, 'D/M/YYYY')
    assert.equal(initFromDataset.schema[3].dateTimeFormat, 'D/M/YYYY H:m')
    assert.equal(initFromDataset.description, 'A description')
    assert.equal(initFromDataset.attachments.length, 1)
    assert.ok(initFromDataset.storage.metadataAttachments.size > 1000)
    assert.ok(initFromDataset.attachments.find((a: any) => a.name === 'avatar.jpeg'))
    const downloadAttachmentRes = await ax.get(`/api/v1/datasets/${initFromDataset.id}/metadata-attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.status, 200)
  })
})
