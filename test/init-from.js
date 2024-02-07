const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('REST datasets with auto-initialization', () => {
  it('Create REST dataset with copied information', async () => {
    const ax = global.ax.dmeadus

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./test/resources/avatar.jpeg'), 'avatar.jpeg')
    await ax.post(`/api/v1/datasets/${dataset.id}/metadata-attachments`, attachmentForm, { headers: testUtils.formHeaders(attachmentForm) })

    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'A description', attachments: [{ name: 'avatar.jpeg', title: 'Avatar' }] })

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)

    assert.ok(!initFromDataset.initFrom)
    assert.ok(initFromDataset.schema.find(p => p.key === 'adr'), 2)
    assert.equal(initFromDataset.description, 'A description')
    assert.equal(initFromDataset.attachments.length, 1)
    assert.ok(initFromDataset.storage.metadataAttachments.size > 1000)
    assert.ok(initFromDataset.attachments.find(a => a.name === 'avatar.jpeg'))
    const downloadAttachmentRes = await ax.get(`/api/v1/datasets/${initFromDataset.id}/metadata-attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.status, 200)
  })

  it('Prevent initializing a dataset when missing permissions', async () => {
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', global.ax.ngernier4)

    const ax = global.ax.dmeadus

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    assert.rejects(workers.hook('finalizer/' + res.data.id), err => err.message.includes('permission manquante'))
  })

  it('Initialize dataset in a department from dataset in orga', async () => {
    const ax = global.ax.dmeadusOrg

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      },
      owner: {
        type: 'organization',
        id: 'KWqAGZ4mG',
        name: 'Fivechat',
        department: 'dep1'
      }
    })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)
    assert.equal(initFromDataset.owner.department, 'dep1')
    assert.equal(initFromDataset.count, 2)
  })
})
