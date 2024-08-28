const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('Datasets with auto-initialization from another one', () => {
  it('Create REST dataset with copied information from file dataset', async () => {
    const ax = global.ax.dmeadus

    const dataset = await testUtils.sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.file.schema[2].dateFormat, 'D/M/YYYY')
    assert.equal(dataset.file.schema[3].dateTimeFormat, 'D/M/YYYY H:m')

    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./test/resources/avatar.jpeg'), 'avatar.jpeg')
    await ax.post(`/api/v1/datasets/${dataset.id}/metadata-attachments`, attachmentForm, { headers: testUtils.formHeaders(attachmentForm) })

    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'A description', attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)

    assert.equal(initFromDataset.schema[0].key, 'date')
    assert.equal(initFromDataset.schema[2].dateFormat, 'D/M/YYYY')
    assert.equal(initFromDataset.schema[3].dateTimeFormat, 'D/M/YYYY H:m')
    assert.equal(initFromDataset.description, 'A description')
    assert.equal(initFromDataset.attachments.length, 1)
    assert.ok(initFromDataset.storage.metadataAttachments.size > 1000)
    assert.ok(initFromDataset.attachments.find(a => a.name === 'avatar.jpeg'))
    const downloadAttachmentRes = await ax.get(`/api/v1/datasets/${initFromDataset.id}/metadata-attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.status, 200)
    const lines = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/lines`)).data
    assert.equal(lines.total, 3)
  })

  it('Create file dataset with copied information from another file dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./test/resources/avatar.jpeg'), 'avatar.jpeg')
    await ax.post(`/api/v1/datasets/${dataset.id}/metadata-attachments`, attachmentForm, { headers: testUtils.formHeaders(attachmentForm) })

    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'A description', attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })

    const res = await ax.post('/api/v1/datasets', {
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)

    assert.equal(initFromDataset.file.name, 'dataset1.csv')
    assert.equal(initFromDataset.schema[0].key, 'id')
    assert.equal(initFromDataset.description, 'A description')
    assert.equal(initFromDataset.attachments.length, 1)
    assert.ok(initFromDataset.storage.metadataAttachments.size > 1000)
    assert.ok(initFromDataset.attachments.find(a => a.name === 'avatar.jpeg'))
    const downloadAttachmentRes = await ax.get(`/api/v1/datasets/${initFromDataset.id}/metadata-attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.status, 200)
    const lines = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    const dataFiles = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/data-files`)).data
    assert.equal(dataFiles.length, 1)
    const fileData = (await ax.get(dataFiles[0].url)).data
    assert.ok(fileData.startsWith('id,adr,'))
  })

  it('Create file dataset that doesn\'t match imported schema', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset2.csv'), 'dataset2.csv')
    form.append('body', JSON.stringify({
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description']
      }
    }))
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)

    assert.equal(initFromDataset.status, 'draft')
    assert.equal(initFromDataset.draft.file.name, 'dataset2.csv')
    assert.equal(initFromDataset.schema[0].key, 'id')

    const journal = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/journal`)).data
    let event = journal.pop()
    assert.equal(event.draft, true)
    assert.equal(event.type, 'dataset-created')
    event = journal.pop()
    assert.equal(event.draft, true)
    assert.equal(event.type, 'error')
    assert.equal(event.data, 'La structure du fichier contient des ruptures de compatibilité.')
    event = journal.pop()
    assert.equal(event.draft, true)
    assert.equal(event.type, 'finalize-end')
  })

  it('Create file dataset with copied information from a rest dataset', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'attr1', type: 'string', description: 'A description' }, { key: 'attr2', type: 'string' }]
    })
    const dataset = await workers.hook('finalizer/rest1')
    await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalizer/rest1')

    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./test/resources/avatar.jpeg'), 'avatar.jpeg')
    await ax.post(`/api/v1/datasets/${dataset.id}/metadata-attachments`, attachmentForm, { headers: testUtils.formHeaders(attachmentForm) })

    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'A description', attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })

    const res = await ax.post('/api/v1/datasets', {
      title: 'init from schema',
      initFrom: {
        dataset: dataset.id, parts: ['schema', 'metadataAttachments', 'description', 'data']
      }
    })
    assert.equal(res.status, 201)
    const initFromDataset = await workers.hook('finalizer/' + res.data.id)

    assert.equal(initFromDataset.file.name, 'rest1.csv')
    assert.equal(initFromDataset.schema[0].key, 'attr1')
    assert.equal(initFromDataset.description, 'A description')
    assert.equal(initFromDataset.attachments.length, 1)
    assert.ok(initFromDataset.storage.metadataAttachments.size > 1000)
    assert.ok(initFromDataset.attachments.find(a => a.name === 'avatar.jpeg'))
    const downloadAttachmentRes = await ax.get(`/api/v1/datasets/${initFromDataset.id}/metadata-attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.status, 200)
    const lines = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/lines`)).data
    assert.equal(lines.total, 1)
    const dataFiles = (await ax.get(`/api/v1/datasets/${initFromDataset.id}/data-files`)).data
    assert.equal(dataFiles.length, 1)
    const fileData = (await ax.get(dataFiles[0].url)).data
    assert.ok(fileData.startsWith('"attr1",'))
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
