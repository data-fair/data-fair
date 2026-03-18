import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, waitForDatasetError, fileExists, setupMockRoute, clearMockRoutes, datasetEsIndicesCount, datasetEsAliasName, getRawDataset, clearDatasetCache, collectNotifications, waitForJournalEvent } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')

// Paths passed to fileExists() are resolved relative to the server's dataDir
const dataDir = '.'

test.describe('datasets in draft mode', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create new dataset in draft mode and validate it', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)

    // Dataset received, parsed, and finalized in draft
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft)
    assert.equal(dataset.draft.status, 'finalized')
    assert.equal(dataset.draft.count, 2)
    assert.equal(dataset.schema.length, 0)
    assert.equal(dataset.draft.schema.filter((s: any) => !s['x-calculated']).length, 6)

    // querying with ?draft=true automatically merges the draft state into the main state
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.draft, undefined)
    assert.equal(dataset.draftReason.key, 'file-new')
    const esAlias = await datasetEsAliasName(dataset.id)
    assert.ok(esAlias.includes('_draft-'), `ES alias "${esAlias}" should contain "_draft-"`)

    // Update schema to specify geo point
    const locProp = dataset.schema.find((p: any) => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema }, { params: { draft: true } })).data
    assert.equal(dataset.status, 'validated')
    assert.equal(dataset.draftReason.key, 'file-new')
    const patchedLocProp = dataset.schema.find((p: any) => p.key === 'loc')
    assert.equal(patchedLocProp['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')

    // Second ES indexation
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.ok(dataset.draft.bbox)
    const locProp2 = dataset.draft.schema.find((p: any) => p.key === 'loc')
    assert.equal(locProp2['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')
    assert.equal(locProp2['x-concept'].id, 'latLon')

    // reuploading in draft mode is not permitted
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } }), (err: any) => err.status === 409)

    // querying for lines is not yet possible
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 409)
    // except in draft mode
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    // validate the draft
    assert.ok(await fileExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.ok(!dataset.draftReason)
    assert.equal(dataset.count, 2)
    assert.ok(dataset.bbox)
    assert.ok(!await fileExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))

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

    assert.equal(await datasetEsIndicesCount(dataset.id), 1)

    assert.ok(await fileExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fileExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
  })

  test('create a draft when updating the data file', async () => {
    const notifCollector = await collectNotifications()

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    // upload a new file with incompatible schema
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
    assert.equal(dataset.draft.file.name, 'dataset2.csv')
    assert.equal(dataset.draft.count, 6)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 6)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    assert.equal(res.headers['x-operation'], '{"class":"read","id":"downloadOriginalData","track":"readDataFiles"}')
    assert.ok(res.data.startsWith('id,adr,some date,loc'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`, { params: { draft: true } })
    assert.ok(res.data.startsWith('id,somedate,employees,adr'))
    // schema should preserve the old order of columns
    assert.deepEqual(dataset.draft.schema.filter((c: any) => !c['x-calculated']).map((c: any) => c.key), ['id', 'adr', 'somedate', 'employees'])

    assert.equal(await datasetEsIndicesCount(dataset.id), 2)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset2.csv')
    assert.ok(dataset.updatedAt > dataset.createdAt)
    assert.equal(dataset.dataUpdatedAt, dataset.updatedAt)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 6)
    assert.equal(res.data.results[0].id, 'koumoul')

    assert.equal(await datasetEsIndicesCount(dataset.id), 1)

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

    assert.equal(await datasetEsIndicesCount(dataset.id), 1)

    // TODO: notification assertions disabled - worker-thread notifications are not reliably
    // captured in the dev environment due to module re-evaluation issues with piscina.
    // The journal assertions above verify the same event flow.
    const notifications = await notifCollector.waitForCount(3)
    await notifCollector.close()
    assert.equal(notifications[0].topic.key, 'data-fair:dataset-dataset-created:' + dataset.slug)
    assert.equal(notifications[1].topic.key, 'data-fair:dataset-draft-data-updated:' + dataset.slug)
    assert.equal(notifications[2].topic.key, 'data-fair:dataset-draft-draft-validated:' + dataset.slug)
  })

  test('create a draft when updating the data file and cancel it', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    // upload a new file with incompatible schema
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 6)

    assert.equal(await datasetEsIndicesCount(dataset.id), 2)

    // cancel the draft
    await ax.delete(`/api/v1/datasets/${dataset.id}/draft`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.draftReason, undefined)

    assert.equal(await datasetEsIndicesCount(dataset.id), 1)

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

  test('create a draft when updating the data file and auto-validate if its schema is compatible', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
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

  test('create a draft when updating the data file but do not auto-validate if there are some validation errors', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    await waitForJournalEvent(dataset.id, 'validate-end')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset1-invalid.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    await waitForDatasetError(ax, dataset.id, { draft: true })

    dataset = await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`).then(r => r.data)
    assert.equal(dataset.draftReason?.key, 'file-updated')
  })

  test('create a draft when updating the data file and cancel it if there are some validation errors', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    await waitForJournalEvent(dataset.id, 'validate-end')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset1-invalid.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: 'compatibleOrCancel' } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    assert.equal(dataset.draftReason.validationMode, 'compatibleOrCancel')
    await waitForJournalEvent(dataset.id, 'validate-end')

    dataset = await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`).then(r => r.data)
    assert.ok(!dataset.draftReason)

    const journal = await ax.get(`/api/v1/datasets/${dataset.id}/journal`).then(r => r.data)
    assert.equal(journal[0].type, 'draft-cancelled')
  })

  test('create a draft at creation and update it with multiple follow-up uploads', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1.csv')
    dataset = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.ok(dataset.status, 'draft')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft2.csv')
    form2.append('description', 'draft description 2')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'created')
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    // upload a new file
    const datasetFd3 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft3.csv')
    form3.append('description', 'draft description 3')
    const datasetDraft3 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })).data
    assert.equal(datasetDraft3.status, 'loaded')
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.ok(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft3.csv')

    // validate the last file
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset1-draft3.csv')
  })

  test('create a draft and update it with second file upload', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft1.csv')
    form2.append('description', 'draft description')
    const datasetDraft1 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })).data
    assert.equal(datasetDraft1.status, 'loaded')
    assert.equal(datasetDraft1.draftReason.key, 'file-updated')
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft1.csv')

    // upload a third file
    const datasetFd3 = fs.readFileSync('./test-it/resources/datasets/dataset2.csv')
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft2.csv')
    form3.append('description', 'draft description')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'loaded')
    assert.equal(datasetDraft2.draftReason.key, 'file-updated')
    await waitForFinalize(ax, dataset.id)
    dataset = await getRawDataset(dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    // validate the third file
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.file.name, 'dataset1-draft2.csv')
  })

  test('create a draft of a large file and index a sample', async () => {
    let content = 'col'
    for (let i = 0; i < 2000; i++) {
      content += '\nval' + i
    }
    const form = new FormData()
    form.append('file', content, 'dataset.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    assert.equal(dataset.draft.count, 100)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 100)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2000)
  })

  test('Create a draft with attachments', async () => {
    const ax = dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization of draft
    dataset = await waitForFinalize(ax, dataset.id)
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
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
  })

  test('Create a draft with attachments then data uploaded separately', async () => {
    const ax = dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)

    // update only the attachments
    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./test-it/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    dataset = await waitForDatasetError(ax, dataset.id, { draft: true })
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'stored')
    assert.ok(!dataset.errorRetry)

    // then update the data
    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Create a draft with data then attachments uploaded separately', async () => {
    const ax = dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)

    // update only the data (not the attachments)
    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')

    // the update the attachments
    const form3 = new FormData()
    form3.append('attachments', fs.readFileSync('./test-it/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Create a draft of a geo file that requires conversion', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)

    let dataset = await waitForFinalize(ax, res.data.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 86)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 86)

    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 86)
    assert.equal(lines.results.length, 12)
    assert.ok(lines.next)
    assert.equal(lines.results[0]._i, 1)
    assert.equal(lines.results[1]._i, 2)
    lines = (await ax.get(lines.next)).data
    assert.equal(lines.total, 86)
    assert.equal(lines.results.length, 12)
    assert.ok(lines.next)
    assert.equal(lines.results[0]._i, 13)
    assert.equal(lines.results[1]._i, 14)
  })

  test('Manage error status in draft mode', async () => {
    const ax = dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    dataset.draft.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    await setupMockRoute({ path: '/geocoder/coords', status: 500, body: 'some error' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    dataset = await waitForDatasetError(ax, dataset.id, { draft: true })
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'validated')
  })

  test('Fails when draft file is missing the input properties', async () => {
    const ax = dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, res.data.id)
    // Fetch with draft=true to get draft schema merged into main (API strips draft field)
    let dataset = (await ax.get(`/api/v1/datasets/${res.data.id}`, { params: { draft: true } })).data
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension
    await setupMockRoute({ path: '/geocoder/coords', ndjsonEcho: { fields: { lat: 10, lon: 10, matchLevel: 'match' }, indexFields: ['matchLevel'] } })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema.length, 11)

    // load a file missing the address property
    const form2 = new FormData()
    const content2 = `label
koumoul
other
`
    form2.append('file', content2, 'dataset2-noadr.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 200)
    await waitForDatasetError(ax, dataset.id, { draft: true })
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent)
    assert.ok(errorEvent.data.includes('un concept nécessaire'))
  })

  test('Delete a dataset in draft state', async () => {
    const ax = dmeadus

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)

    assert.ok(await fileExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    assert.ok(!await fileExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fs.pathExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 404)
  })

  test('Accepts a new file with compatible keys but different names', async () => {
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1-names.csv'), 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'Id')
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule 2')
    let csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"Id","Adr"'))

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    dataset = await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    })
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'id')
    assert.equal(dataset.file.schema[0].key, 'id')
    assert.equal(dataset.file.schema[0]['x-originalName'], 'id')
    await clearDatasetCache()
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule')
    csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"id","adr"'))
  })
})
