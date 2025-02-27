import { strict as assert } from 'node:assert'

import * as testUtils from './resources/test-utils.js'
import fs from 'node:fs'
import * as workers from '../api/src/workers/index.js'
import FormData from 'form-data'

describe('Attachments', function () {
  it('Process newly uploaded attachments alone', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)
    assert.equal(dataset.status, 'created')

    // dataset converted
    dataset = await workers.hook(`fileNormalizer/${dataset.id}`)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'files.csv')

    // ES indexation and finalization
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { highlight: '_file.content', q: 'test' }
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find(item => item.file === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.status, 200)
  })

  it.skip('Process attachments with encoded filenames', async function () {
    const datasetFd = fs.readFileSync('/home/alban/tmp/tmp.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files-encoded-name.zip')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = await workers.hook(`finalizer/${res.data.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?size=1000`)
    // console.log(res.data.results)
    const line = res.data.results.find(line => line.file.startsWith('2021-200_'))
    res = await ax.get(line._attachment_url)
    assert.equal(res.headers['content-type'], 'application/pdf')
  })

  it('Process newly uploaded attachments along with data file', async function () {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' }
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find(item => item.attachment === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
  })

  it('Keep attachments when updating data', async function () {
    console.log(1)
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.storage.attachments.size, attachmentsSize)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')
  })

  it('Update attachments with data', async function () {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./resources/datasets/attachments2.csv'), 'attachments2.csv')
    form2.append('attachments', fs.readFileSync('./resources/datasets/files2.zip'), 'files2.zip')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Update attachments only then data only', async function () {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: testUtils.formHeaders(form2) })
    try {
      await workers.hook(`finalizer/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.ok(err.message.includes('Valeurs invalides : dir1/test.pdf'))
    }

    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form3, { headers: testUtils.formHeaders(form3) })
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Detect wrong attachment path', async function () {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments-wrong-paths.csv'), 'attachments-wrong-paths.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    await assert.rejects(workers.hook(`finalizer/${dataset.id}`), (err) => {
      assert.ok(err.message.includes('une colonne semble contenir des chemins'))
      assert.ok(err.message.includes('Valeurs invalides : BADFILE.txt'))
      return true
    })
  })

  it('Detect missing attachment paths', async function () {
    const ax = global.ax.cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments-no-paths.csv'), 'attachments-no-paths.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
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
