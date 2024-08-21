const assert = require('assert').strict
const fs = require('fs-extra')
const nock = require('nock')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

const schema = [
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

describe('file datasets with validation rules', () => {
  it('create a valid dataset with initial validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('datasetStateManager/' + dataset.id)
    assert.equal(dataset.count, 2)
  })

  it('create an invalid dataset with initial validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = global.ax.dmeadus
    const dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    await assert.rejects(workers.hook('datasetStateManager/' + dataset.id), err => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })
  })

  it('create a valid dataset then patch compatible validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('datasetStateManager/' + dataset.id)
    assert.equal(dataset.count, 2)
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'updated')
    dataset = await workers.hook('datasetStateManager/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
  })

  it('create a valid dataset then patch incompatible validation rules', async () => {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('datasetStateManager/' + dataset.id)
    assert.equal(dataset.count, 2)
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'updated')
    await assert.rejects(workers.hook('datasetStateManager/' + dataset.id), err => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })
  })
})
