import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import fs from 'fs-extra'
import path from 'node:path'
import FormData from 'form-data'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'
import * as esUtils from '../api/src/datasets/es/index.ts'
import { indexPrefix } from '../api/src/datasets/es/manage-indices.js'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'
import testEvents from '@data-fair/data-fair-api/src/misc/utils/test-events.ts'
import es from '../api/src/es.ts'

describe('datasets in draft mode', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('create new dataset in draft mode and validate it', async function () {
    const ax = dmeadus
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
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
    const esAlias = esUtils.aliasName(dataset)
    assert.ok(esAlias.startsWith('dataset-test_draft-'))

    const locProp = dataset.schema.find((p: any) => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema }, { params: { draft: true } })).data
    assert.equal(dataset.status, 'validated')
    assert.equal(dataset.draftReason.key, 'file-new')
    const patchedLocProp = dataset.schema.find((p: any) => p.key === 'loc')
    assert.equal(patchedLocProp['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')

    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.ok(dataset.draft.bbox)
    const locProp2 = dataset.draft.schema.find((p: any) => p.key === 'loc')
    assert.equal(locProp2['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')
    assert.equal(locProp2['x-concept'].id, 'latLon')

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/bad-format.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) }), (err: any) => err.status === 409)

    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 409)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    assert.ok(await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.ok(!dataset.draftReason)
    assert.equal(dataset.count, 2)
    assert.ok(dataset.bbox)
    assert.ok(!await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')
    assert.equal(journal.pop().type, 'structure-updated')
    assert.equal(journal.pop().type, 'finalize-end')
    assert.equal(journal.pop().type, 'draft-validated')
    assert.equal(journal.pop().type, 'finalize-end')

    const indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 1)

    assert.ok(await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
  })

  it('create a draft when updating the data file', async function () {
    const notifications: any[] = []
    testEvents.on('notification', (n: any) => notifications.push(n))

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalize/' + dataset.id)
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
    assert.deepEqual(dataset.draft.schema.filter((c: any) => !c['x-calculated']).map((c: any) => c.key), ['id', 'adr', 'somedate', 'employees'])

    let indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 2)

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset2.csv')
    assert.ok(dataset.updatedAt > dataset.createdAt)
    assert.equal(dataset.dataUpdatedAt, dataset.updatedAt)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 6)
    assert.equal(res.data.results[0].id, 'koumoul')

    indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 1)

    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')

    let evt = journal.pop()
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    const errorEvent = journal.pop()
    assert.equal(errorEvent.type, 'validation-error')
    assert.ok(errorEvent.data.startsWith('La structure'))
    assert.equal(journal.pop().type, 'finalize-end')

    assert.equal(journal.pop().type, 'draft-validated')
    evt = journal.pop()
    assert.equal(evt.type, 'finalize-end')
    assert.equal(evt.draft, undefined)

    indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 1)

    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-dataset-created:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-draft-data-updated:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-draft-draft-validated:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-data-updated:' + dataset.slug)
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-breaking-change:' + dataset.slug)
  })

  it('create a draft when updating the data file and cancel it', async function () {
    const notifications: any[] = []
    testEvents.on('notification', (n: any) => notifications.push(n))

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    dataset = await workers.hook('finalize/' + dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 6)

    let indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 2)

    await ax.delete(`/api/v1/datasets/${dataset.id}/draft`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.draftReason, undefined)

    indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    assert.equal(Object.keys(indices).length, 1)

    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')

    let evt = journal.pop()
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    const errorEvent = journal.pop()
    assert.equal(errorEvent.type, 'validation-error')
    assert.ok(errorEvent.data.startsWith('La structure'))
    assert.equal(journal.pop().type, 'finalize-end')

    assert.equal(journal.pop().type, 'draft-cancelled')
    evt = journal.pop()
    assert.equal(journal.length, 0)
  })

  it('create a draft when updating the data file and auto-validate if it\'s schema is compatible', async function () {
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
    assert.ok(!dataset.draft)
    assert.ok(!dataset.draft)
    assert.ok(!!dataset.file.schema.length)
    assert.ok(!!dataset.schema.length)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
    assert.equal(res.data.results[1].id, 'bidule')

    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal.pop().type, 'dataset-created')
    assert.equal(journal.pop().type, 'finalize-end')
    let evt = journal.pop()
    assert.equal(evt.type, 'data-updated')
    assert.equal(evt.draft, true)
    assert.equal(journal.pop().type, 'draft-validated')
    evt = journal.pop()
    assert.equal(evt.type, 'finalize-end')
    assert.equal(evt.draft, undefined)
  })

  it('create a draft when updating the data file but do not auto-validate if there are some validation errors', async function () {
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    dataset = await workers.hook('validateFile/' + dataset.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1-invalid.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err: any) => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })

    dataset = await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`).then(r => r.data)
    assert.equal(dataset.draftReason?.key, 'file-updated')
  })

  it('create a draft when updating the data file and cancel it if there are some validation errors', async function () {
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    dataset = await workers.hook('validateFile/' + dataset.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1-invalid.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: 'compatibleOrCancel' } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    assert.equal(dataset.draftReason.validationMode, 'compatibleOrCancel')
    await workers.hook('validateFile/' + dataset.id)

    dataset = await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`).then(r => r.data)
    assert.ok(!dataset.draftReason)

    const journal = await ax.get(`/api/v1/datasets/${dataset.id}/journal`).then(r => r.data)
    assert.equal(journal[0].type, 'draft-cancelled')
  })

  it('create a draft at creation and update it with multiple follow-up uploads', async function () {
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalize/' + res.data.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1.csv')
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'draft')

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft2.csv')
    form2.append('description', 'draft description 2')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'loaded')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-updated')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    const datasetFd3 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft3.csv')
    form3.append('description', 'draft description 3')
    const datasetDraft3 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3), params: { draft: true } })).data
    assert.equal(datasetDraft3.status, 'loaded')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-updated')
    assert.equal(dataset.draft.file.name, 'dataset1-draft3.csv')

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset1-draft3.csv')
  })

  it('create a draft and update it with second file upload', async function () {
    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft1.csv')
    form2.append('description', 'draft description')
    const datasetDraft1 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(datasetDraft1.status, 'loaded')
    assert.equal(datasetDraft1.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft1.csv')

    const datasetFd3 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft2.csv')
    form3.append('description', 'draft description')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3), params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'loaded')
    assert.equal(datasetDraft2.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.file.name, 'dataset1-draft2.csv')
  })

  it('create a draft of a large file and index a sample', async function () {
    let content = 'col'
    for (let i = 0; i < 2000; i++) {
      content += '\nval' + i
    }
    const form = new FormData()
    form.append('file', content, 'dataset.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.draft.count, 100)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 100)

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2000)
  })

  it('Create a draft with attachments', async function () {
    const ax = dmeadus

    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/attachments.csv')), 'attachments.csv')
    form.append('attachments', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files.zip')), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = res.data
    assert.equal(res.status, 201)

    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.status, 'draft')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test', draft: true, thumbnail: true } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._attachment_url.endsWith('?draft=true'))
    assert.ok(res.data.results[0]._thumbnail.endsWith('?width=300&height=200&draft=true'))
    res = await ax.get(res.data.results[1]._attachment_url)
    assert.equal(res.status, 200)

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
  })

  it('Create a draft with attachments then data uploaded separately', async function () {
    const ax = dmeadus

    const form = new FormData()
    form.append('dataset', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/attachments.csv')), 'attachments.csv')
    form.append('attachments', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files.zip')), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)

    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files2.zip')), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: formHeaders(form2), params: { draft: true } })
    await assert.rejects(workers.hook(`finalize/${dataset.id}`), (err: any) => {
      console.log(err.stack)
      if (!err.message.includes('Valeurs invalides : dir1/test.pdf')) {
        assert.fail(`error message should contain "Valeurs invalides : dir1/test.pdf", instead got "${err.message}"`)
      }
      return true
    })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`)).data
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'stored')
    assert.ok(!dataset.errorRetry)

    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/attachments2.csv')), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: formHeaders(form3), params: { draft: true } })
    await workers.hook(`finalize/${dataset.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Create a draft with data then attachments uploaded separately', async function () {
    const ax = dmeadus

    const form = new FormData()
    form.append('dataset', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/attachments.csv')), 'attachments.csv')
    form.append('attachments', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files.zip')), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/attachments2.csv')), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: formHeaders(form2), params: { draft: true } })
    await workers.hook(`finalize/${dataset.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')

    const form3 = new FormData()
    form3.append('attachments', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files2.zip')), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: formHeaders(form3), params: { draft: true } })
    await workers.hook(`finalize/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Create a draft of a geo file that requires conversion', async function () {
    if ((config as any).ogr2ogr?.skip) {
      console.log('Skip ogr2ogr test in this environment')
      return
    }

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/geo/stations.zip'))
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    let dataset = await workers.hook('normalizeFile/' + res.data.id)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'normalized')
    assert.equal(dataset.draft.file.name, 'stations.geojson')

    dataset = await workers.hook('finalize/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 86)

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
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

  it('Delete a dataset in draft state', async function () {
    const ax = dmeadus

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('finalize/' + res.data.id)

    assert.ok(await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    assert.ok(!await filesStorage.pathExists(`${dataDir}/user/dmeadus0/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fs.pathExists(`${dataDir}/user/dmeadus0/datasets-drafts/${dataset.id}`))
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 404)
  })

  it('Accepts a new file with compatible keys but different names', async function () {
    const form = new FormData()
    form.append('file', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1-names.csv')), 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'Id')
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule 2')
    let csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"Id","Adr"'))

    const form2 = new FormData()
    form2.append('file', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv')), 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'id')
    assert.equal(dataset.file.schema[0].key, 'id')
    assert.equal(dataset.file.schema[0]['x-originalName'], 'id')
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule')
    csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"id","adr"'))
  })

  it('create a draft when updating the data file and cancel it if there are some validation errors', async function () {
    const ax = dmeadus
    const workers = await import('../api/src/workers/index.ts')

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)

    const schema = dataset.schema
    schema[0].pattern = '^[a-z]+$'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    dataset = await workers.hook('validateFile/' + dataset.id)

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1-invalid.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-invalid.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: 'compatibleOrCancel' } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    assert.equal(dataset.draftReason.validationMode, 'compatibleOrCancel')
    await workers.hook('validateFile/' + dataset.id)

    dataset = await ax.get(`/api/v1/datasets/${dataset.id}?draft=true`).then(r => r.data)
    assert.ok(!dataset.draftReason)

    const journal = await ax.get(`/api/v1/datasets/${dataset.id}/journal`).then(r => r.data)
    assert.equal(journal[0].type, 'draft-cancelled')
  })

  it('create a draft at creation and update it with multiple follow-up uploads', async function () {
    const ax = dmeadus
    const workers = await import('../api/src/workers/index.ts')

    const datasetFd = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.csv'))
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalize/' + res.data.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1.csv')
    dataset = await ax.get('/api/v1/datasets/' + dataset.id)
    assert.equal(dataset.status, 'draft')

    const datasetFd2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset1-draft2.csv')
    form2.append('description', 'draft description 2')
    const datasetDraft2 = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2), params: { draft: true } })).data
    assert.equal(datasetDraft2.status, 'created')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft2.csv')

    const datasetFd3 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset2.csv'))
    const form3 = new FormData()
    form3.append('file', datasetFd3, 'dataset1-draft3.csv')
    form3.append('description', 'draft description 3')
    const datasetDraft3 = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3), params: { draft: true } })).data
    assert.equal(datasetDraft3.status, 'loaded')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.file)
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.equal(dataset.draft.file.name, 'dataset1-draft3.csv')

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset1-draft3.csv')
  })
})
