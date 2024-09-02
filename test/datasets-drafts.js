const assert = require('assert').strict
const fs = require('fs-extra')
const nock = require('nock')
const FormData = require('form-data')
const config = require('config')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')
const esUtils = require('../server/datasets/es')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

describe('datasets in draft mode', () => {
  it('create new dataset in draft mode and validate it', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('csvAnalyzer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.file, undefined)
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.ok(dataset.draft.originalFile)
    assert.ok(dataset.draft.file)
    assert.equal(dataset.draft.status, 'analyzed')
    assert.equal(dataset.schema.length, 0)
    assert.equal(dataset.draft.schema.length, 6)

    // ES indexation and finalization
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.equal(dataset.draft.count, 2)
    console.log(dataset.dataUpdatedAt, dataset.dataUpdatedBy)

    // querying with ?draft=true automatically merges the draft state into the main state
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.draft, undefined)
    assert.equal(dataset.draftReason.key, 'file-new')
    const esAlias = esUtils.aliasName(dataset)
    assert.ok(esAlias.startsWith('dataset-test_draft-'))

    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema }, { params: { draft: true } })).data
    assert.equal(dataset.status, 'validated')
    assert.equal(dataset.draftReason.key, 'file-new')
    const patchedLocProp = dataset.schema.find(p => p.key === 'loc')
    assert.equal(patchedLocProp['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')

    // Second ES indexation
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.ok(dataset.draft.bbox)
    const locProp2 = dataset.draft.schema.find(p => p.key === 'loc')
    assert.equal(locProp2['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')
    assert.equal(locProp2['x-concept'].id, 'latLon')

    // reuploading in draft mode is not permitted
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) }), err => err.status === 409)

    // querying for lines is not yet possible
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines`), err => err.status === 409)
    // except in draft mode
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    // validate the draft
    assert.ok(await fs.pathExists(`data/test/user/dmeadus0/datasets-drafts/${dataset.id}`))
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.ok(!dataset.draftReason)
    assert.equal(dataset.count, 2)
    assert.ok(dataset.bbox)
    assert.ok(!await fs.pathExists(`data/test/user/dmeadus0/datasets-drafts/${dataset.id}`))
    console.log(dataset.dataUpdatedAt, dataset.dataUpdatedBy)

    // querying lines is now possible
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    // the journal kept traces of all changes (draft and not)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    // 1rst data load
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')
    // patched schema with draft=true
    assert.equal(journal.pop().type, 'structure-updated')
    assert.equal(journal.pop().type, 'finalize-end')
    // draft validated
    assert.equal(journal.pop().type, 'draft-validated')
    assert.equal(journal.pop().type, 'finalize-end')

    assert.ok(await fs.pathExists(`data/test/user/dmeadus0/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fs.pathExists(`data/test/user/dmeadus0/datasets/${dataset.id}`))
  })

  it('create a draft when updating the data file', async () => {
    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file with incompatible schema
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
    assert.equal(dataset.draft.file.name, 'dataset2.csv')
    assert.equal(dataset.draft.count, 5)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 5)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    assert.equal(res.headers['x-operation'], '{"class":"read","id":"downloadOriginalData","track":"readDataFiles"}')
    assert.ok(res.data.startsWith('id,adr,some date,loc'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`, { params: { draft: true } })
    assert.ok(res.data.startsWith('id,somedate,employees,adr'))
    // schema should respect the new order of columns
    assert.deepEqual(dataset.draft.schema.filter(c => !c['x-calculated']).map(c => c.key), ['id', 'somedate', 'employees', 'adr'])

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset2.csv')
    assert.ok(dataset.updatedAt > dataset.createdAt)
    assert.equal(dataset.dataUpdatedAt, dataset.updatedAt)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 5)
    assert.equal(res.data.results[0].id, 'koumoul')

    // the journal kept traces of all changes (draft and not)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    // 1rst data upload
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')

    // 2nd data upload
    let evt = journal.pop()
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    const errorEvent = journal.pop()
    assert.equal(errorEvent.type, 'validation-error')
    assert.ok(errorEvent.data.startsWith('La structure'))
    assert.equal(journal.pop().type, 'finalize-end')

    // manual draft validation
    assert.equal(journal.pop().type, 'draft-validated')
    evt = journal.pop()
    assert.equal(evt.type, 'finalize-end')
    assert.equal(evt.draft, undefined)

    // the notifications contain the same thing as the journal minus not very interesting events
    // and adding some extra events were triggerred when validating the draft
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-dataset-created:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-finalize-end:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-draft-data-updated:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-data-updated:' + dataset.slug)
    // console.log(notifications.shift())
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-breaking-change:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-finalize-end:' + dataset.slug)
  })

  it('create a draft when updating the data file and cancel it', async () => {
    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file with incompatible schema
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    dataset = await workers.hook('finalizer')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 5)

    // cancel the draft
    await ax.delete(`/api/v1/datasets/${dataset.id}/draft`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.draftReason, undefined)

    // the journal kept traces of all changes (draft and not)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    // 1rst data upload
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')

    // 2nd data upload
    let evt = journal.pop()
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    const errorEvent = journal.pop()
    assert.equal(errorEvent.type, 'validation-error')
    assert.ok(errorEvent.data.startsWith('La structure'))
    assert.equal(journal.pop().type, 'finalize-end')

    // draft cancellation
    assert.equal(journal.pop().type, 'draft-cancelled')
    evt = journal.pop()
    assert.equal(journal.length, 0)
  })

  it('create a draft when updating the data file and auto-validate if it\'s schema is compatible', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
    // console.log(dataset)
    assert.ok(!dataset.draft)
    assert.ok(dataset.file.schema.length, 6)
    assert.ok(dataset.schema.length, 6)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    // 1rst data upload
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')
    let evt = journal.pop()
    // new compatible data uploaded
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    assert.equal(journal.pop().type, 'draft-validated')
    evt = journal.pop()
    assert.equal(evt.type, 'finalize-end')
    assert.equal(evt.draft, undefined)
  })

  it('create a draft when updating the data file but do not auto-validate if there are some validation errors', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    dataset = await workers.hook('fileValidator')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset1-invalid.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    await assert.rejects(workers.hook('finalizer/' + dataset.id), (err) => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })
  })

  it('create a draft at creation and update it with multiple follow-up uploads', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalizer')
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1.csv')
    dataset = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.ok(dataset.status, 'draft')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft2.csv')
    form2.append('description', 'draft description 2')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'created')
    dataset = await workers.hook('finalizer')
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    // upload a new file
    const datasetFd3 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft3.csv')
    form3.append('description', 'draft description 3')
    const datasetDraft3 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: testUtils.formHeaders(form3), params: { draft: true } })).data
    assert.equal(datasetDraft3.status, 'loaded')
    dataset = await workers.hook('finalizer')
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft3.csv')

    // validate the last file
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.ok(!dataset.draft)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset1-draft3.csv')
  })

  it('create a draft and update it with second file upload', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft1.csv')
    form2.append('description', 'draft description')
    const datasetDraft1 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(datasetDraft1.status, 'loaded')
    assert.equal(datasetDraft1.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft1.csv')

    // upload a third file
    const datasetFd3 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft2.csv')
    form3.append('description', 'draft description')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: testUtils.formHeaders(form3), params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'loaded')
    assert.equal(datasetDraft2.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    // validate the third file
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.ok(!dataset.draft)
    assert.equal(dataset.file.name, 'dataset1-draft2.csv')
  })

  it('create a draft of a large file and index a sample', async () => {
    let content = 'col'
    for (let i = 0; i < 2000; i++) {
      content += '\nval' + i
    }
    const form = new FormData()
    form.append('file', content, 'dataset.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalizer')
    assert.equal(dataset.draft.count, 100)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 100)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.count, 2000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2000)
  })

  it('Create a draft with attachments', async () => {
    const ax = global.ax.dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization of draft
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'draft')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test', draft: true, thumbnail: true } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._attachment_url.endsWith('?draft=true'))
    assert.ok(res.data.results[0]._thumbnail.endsWith('?width=300&height=200&draft=true'))
    res = await ax.get(res.data.results[1]._attachment_url)
    assert.equal(res.status, 200)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
  })

  it('Create a draft with attachments then data uploaded separately', async () => {
    const ax = global.ax.dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook(`finalizer/${dataset.id}`)

    // update only the attachments
    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./test/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })
    await assert.rejects(workers.hook(`finalizer/${dataset.id}`), (err) => {
      if (!err.message.includes('Valeurs invalides : dir1/test.pdf')) {
        console.error('wrong error message in error', err)
        assert.fail(`error message should contain "Valeurs invalides : dir1/test.pdf", instead got "${err.message}"`)
      }
      return true
    })

    // then update the data
    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./test/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: testUtils.formHeaders(form3), params: { draft: true } })
    await workers.hook(`finalizer/${dataset.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Create a draft with data then attachments uploaded separately', async () => {
    const ax = global.ax.dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook(`finalizer/${dataset.id}`)

    // update only the data (not the attachments)
    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })
    await workers.hook(`finalizer/${dataset.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')

    // the update the attachments
    const form3 = new FormData()
    form3.append('attachments', fs.readFileSync('./test/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: testUtils.formHeaders(form3), params: { draft: true } })
    await workers.hook(`finalizer/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Create a draft of a geo file that requires conversion', async () => {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    // dataset converted
    let dataset = await workers.hook('fileNormalizer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'normalized')
    assert.equal(dataset.draft.file.name, 'stations.geojson')

    dataset = await workers.hook('finalizer')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 86)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 86)
  })

  it('Manage error status in draft mode', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.draft.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    nock('http://test.com').post('/geocoder/coords').reply(500, 'some error')
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    try {
      await workers.hook('extender')
      assert.fail()
    } catch (err) {
      assert.equal(err.message, '500 - some error')
    }

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'error')
  })

  it('Fails when draft file is missing the input properties', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.draft.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension
    nock('http://test.com').post('/geocoder/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 2)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    await workers.hook(`finalizer/${dataset.id}`)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.schema.length, 11)

    // load a file missing the address property

    const form2 = new FormData()
    const content2 = `label
koumoul
other
`
    form2.append('file', content2, 'dataset2-noadr.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook(`finalizer/${dataset.id}`), (err) => {
      assert.ok(err.message.startsWith('un concept nécessaire'))
      return true
    })
  })

  it('Delete a dataset in draft state', async () => {
    const ax = global.ax.dmeadus

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('finalizer/' + res.data.id)

    assert.ok(await fs.pathExists('data/test/user/dmeadus0/datasets-drafts/' + dataset.id))
    assert.ok(!await fs.pathExists('data/test/user/dmeadus0/datasets/' + dataset.id))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fs.pathExists('data/test/user/dmeadus0/datasets-drafts/' + dataset.id))
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 404)
  })
})
