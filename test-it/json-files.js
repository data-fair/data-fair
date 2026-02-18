import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'

describe('json files support', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process uploaded json dataset', async function () {
    // Send dataset
    const form = new FormData()
    form.append('file', JSON.stringify([{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }]), 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].col1, 'val1')

    const dataFiles = (await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)).data
    assert.equal(dataFiles.length, 2)
    assert.equal(dataFiles[0].name, 'example.json')
    assert.equal(dataFiles[1].name, 'example.csv')
    const csv = (await ax.get(dataFiles[1].url)).data
    assert.equal(csv, `"col1","col2"
"val1",1
"val2",2
`)
  })

  it('Process uploaded ndjson dataset', async function () {
    // Send dataset
    const form = new FormData()
    form.append('file', [{ col1: 'val1', col2: 1 }, { col1: 'val2', col2: 2 }].map(o => JSON.stringify(o)).join('\n'), 'example.ndjson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = res.data

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].col1, 'val1')

    const dataFiles = (await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)).data
    console.log(dataFiles)
    assert.equal(dataFiles.length, 2)
    assert.equal(dataFiles[0].name, 'example.ndjson')
    assert.equal(dataFiles[1].name, 'example.csv')
    const csv = (await ax.get(dataFiles[1].url)).data
    assert.equal(csv, `"col1","col2"
"val1",1
"val2",2
`)
  })

  it('Fails when root is not an array', async function () {
    const form = new FormData()
    form.append('file', JSON.stringify({ col1: 'val1' }), 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err) => err.message.includes('expect an array'))
  })

  it('Fails when json is invalid', async function () {
    const form = new FormData()
    form.append('file', "{ col1: 'val1' }", 'example.json')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data

    // ES indexation and finalization
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err) => err.message.includes('Unexpected'))
  })
})
