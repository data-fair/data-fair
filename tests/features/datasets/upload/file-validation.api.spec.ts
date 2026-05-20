import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, waitForDatasetError, waitForJournalEvent, collectNotifications } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const schema: any[] = [
  {
    key: 'id',
    type: 'string',
    pattern: '^[a-z]+$'
  },
  {
    key: 'adr',
    type: 'string'
  },
  {
    key: 'some_date',
    type: 'string',
    format: 'date'
  },
  {
    key: 'loc',
    type: 'string'
  },
  {
    key: 'bool',
    type: 'boolean'
  },
  {
    key: 'nb',
    type: 'number'
  }
]

const schemaWithFix = [...schema]
schemaWithFix[0] = { ...schemaWithFix[0], 'x-transform': { expr: 'LOWER(value)' } }

test.describe('file datasets with validation rules', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create a valid dataset with initial validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2)
  })

  test('create an invalid dataset with initial validation rules', async () => {
    // subscribe before upload so journals.log fan-out lands in the buffer
    const notifCollector = await collectNotifications()
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    await waitForDatasetError(ax, dataset.id)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'validation-error')
    assert.ok(errorEvent)
    assert.ok(errorEvent.data.includes('ont une erreur de validation'))

    const captured = await notifCollector.getAll()
    await notifCollector.close()
    // specific + umbrella dataset-error share the same _id
    const topics = captured.map((n: any) => n.topic?.key)
    const umbrellaNotif = captured.find((n: any) => n.topic?.key === `data-fair:dataset-error:${dataset.id}`)
    assert.ok(umbrellaNotif, `expected umbrella dataset-error notif, got: ${JSON.stringify(topics)}`)
    const specificNotif = captured.find((n: any) => n.topic?.key === `data-fair:dataset-validation-error:${dataset.id}`)
    assert.ok(specificNotif, `expected specific dataset-validation-error notif, got: ${JSON.stringify(topics)}`)
    const matchingUmbrella = captured.find((n: any) => n.topic?.key === `data-fair:dataset-error:${dataset.id}` && n._id === specificNotif._id)
    assert.ok(matchingUmbrella, 'umbrella push should share _id with the specific validation-error push')
    assert.ok(JSON.stringify(umbrellaNotif.body).includes('ont une erreur de validation'), `notif body should carry the validation detail, got: ${JSON.stringify(umbrellaNotif.body)}`)

    // apply a transformation to fix the issue
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })

  test('create a valid dataset then patch compatible validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2)
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    await waitForJournalEvent(dataset.id, 'validate-end')
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'finalized')
  })

  test('create a valid dataset then patch incompatible validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2)
    let patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    await waitForDatasetError(ax, dataset.id)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'validation-error')
    assert.ok(errorEvent)
    assert.ok(errorEvent.data.includes('ont une erreur de validation'))

    // apply a transformation to fix the issue
    patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })

  test('manage validation rules for multi-valued cols', async () => {
    const schema = [{
      key: 'id',
      type: 'string'
    }, {
      key: 'multinb',
      type: 'number',
      separator: ';'
    }, {
      key: 'multipattern',
      type: 'string',
      pattern: '^test[0-9]$',
      separator: ', '
    }]

    // Create a valid dataset
    const form = new FormData()
    form.append('file', `id,multinb,multipattern
koumoul,"111 ; 222","test1, test2"
bidule,123,test3`, 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2)
    let lines = await ax.get(`/api/v1/datasets/${dataset.id}/lines`).then(r => r.data.results)
    assert.equal(lines[0].multipattern, 'test1, test2')
    lines = await ax.get(`/api/v1/datasets/${dataset.id}/lines?arrays=true`).then(r => r.data.results)
    assert.deepEqual(lines[0].multipattern, ['test1', 'test2'])

    // then an invalid dataset
    const form2 = new FormData()
    form2.append('file', `id,multinb,multipattern
koumoul,"111 ; 222","test1, testko"
bidule,123,test3`, 'dataset1.csv')
    form2.append('schema', JSON.stringify(schema))
    const dataset2 = await ax.post('/api/v1/datasets', form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } }).then(r => r.data)
    await waitForDatasetError(ax, dataset2.id)
    const journal = (await ax.get(`/api/v1/datasets/${dataset2.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'validation-error')
    assert.ok(errorEvent)
    assert.ok(errorEvent.data.includes('/multipattern/1 doit correspondre au format'))
  })
})
