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

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' }
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find((item: any) => item.attachment === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
  })

  it('Keep attachments when updating data', async function () {
    const ax = cdurning2
    const workers = await import('../api/src/workers/index.ts')

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.storage.attachments.size, attachmentsSize)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')
  })

  it('Update attachments with data', async function () {
    const ax = cdurning2
    const workers = await import('../api/src/workers/index.ts')

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test/resources/datasets/attachments2.csv'), 'attachments2.csv')
    form2.append('attachments', fs.readFileSync('./test/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Update attachments only then data only', async function () {
    const ax = cdurning2
    const workers = await import('../api/src/workers/index.ts')

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./test/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: formHeaders(form2) })
    try {
      await workers.hook(`finalize/${dataset.id}`)
      assert.fail()
    } catch (err: any) {
      assert.ok(err.message.includes('Valeurs invalides : dir1/test.pdf'))
    }

    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./test/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Detect wrong attachment path', async function () {
    const ax = cdurning2
    const workers = await import('../api/src/workers/index.ts')

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments-wrong-paths.csv'), 'attachments-wrong-paths.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    await assert.rejects(workers.hook(`finalize/${dataset.id}`), (err: any) => {
      assert.ok(err.message.includes('une colonne semble contenir des chemins'))
      assert.ok(err.message.includes('Valeurs invalides : BADFILE.txt'))
      return true
    })
  })

  it('Detect missing attachment paths', async function () {
    const ax = cdurning2
    const workers = await import('../api/src/workers/index.ts')

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments-no-paths.csv'), 'attachments-no-paths.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    try {
      await workers.hook(`finalize/${dataset.id}`)
      assert.fail()
    } catch (err: any) {
      assert.ok(err.message.includes('aucune colonne ne contient les chemins'))
      assert.ok(err.message.includes('Valeurs attendues :'))
      assert.ok(err.message.includes('test.odt'))
      assert.ok(err.message.includes('dir1/test.pdf'))
    }
  })
})
