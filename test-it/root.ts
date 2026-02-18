import { strict as assert } from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import WebSocket from 'ws'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import dcatNormalize from '../api/src/misc/utils/dcat/normalize.js'
import dcatValidate from '../api/src/misc/utils/dcat/validate.js'
import config from 'config'

const anonymous = getAxios()
const superadmin = await getAxiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const superadminPersonal = await getAxiosAuth('superadmin@test.com', 'superpasswd')
const icarlens9 = await getAxiosAuth('icarlens9@independent.co.uk', 'passwd')

const geocoderApi = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '/resources/geocoder-api.json'), 'utf8'))
const odsRdfExample = fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/ods-export.rdf'), 'utf-8')
const cioExample = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/example-cio.json'), 'utf8'))
const semiceuExample = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/example-semiceu.json'), 'utf8'))

describe('root', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get API documentation', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
  })

  it('Get vocabulary', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/vocabulary')
    assert.equal(res.status, 200)
  })

  it('Get service info', async function () {
    const ax = superadmin
    const res = await ax.get('/api/v1/admin/info')
    assert.equal(res.status, 200)
    assert.equal(res.data.version, 'test')
  })

  it('Check API format', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/_check-api', geocoderApi)
    assert.equal(res.status, 200)
    delete geocoderApi.openapi
    await assert.rejects(
      ax.post('/api/v1/_check-api', geocoderApi),
      { status: 400 }
    )
  })

  it('serves streamsaver resources', async function () {
    const ax = anonymous
    const mitm = await ax.get('/streamsaver/mitm.html')
    assert.equal(mitm.status, 200)
    assert.equal(mitm.headers['content-type'], 'text/html; charset=utf-8')
    assert.ok(mitm.data.includes('mitm.html is the lite "man in the middle"'))

    const sw = await ax.get('/streamsaver/sw.js')
    assert.equal(sw.status, 200)
    assert.equal(sw.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.ok(sw.data.includes('self.onmessage'))
  })

  it('Get status', async function () {
    await assert.rejects(anonymous.get('/api/v1/admin/status'), (err: any) => err.status === 401)
    await assert.rejects(superadminPersonal.get('/api/v1/admin/status'), (err: any) => err.status === 403)
    const res = await superadmin.get('/api/v1/admin/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 6)
  })

  it('Ping service', async function () {
    const res = await anonymous.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })

  it('Check identities secret key', async function () {
    const ax = anonymous
    await assert.rejects(
      ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } }),
      { status: 403 }
    )
  })

  it('Propagate name change to a dataset owner identity', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Danna Meadus')
    let res = await ax.post(`/api/v1/identities/user/${dataset.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.owner.name, 'Another Name')
  })

  it('Delete an identity completely', async function () {
    const ax = icarlens9
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Issie Carlens')
    const userDir = path.join(dataDir, 'user', 'icarlens9')
    assert.ok(await filesStorage.pathExists(userDir))
    const res = await ax.delete('/api/v1/identities/user/icarlens9', { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${dataset.id}`),
      { status: 404 }
    )
    assert.ok(!await filesStorage.pathExists(userDir))
  })

  async function receiveWS (cli) {
    const res = await eventPromise(cli, 'message')
    return JSON.parse(res)
  }

  it('Connect to web socket server', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
  })

  it('Receive error from websocker server when sending bad input', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send('{blabla}')
    let msg = await receiveWS(cli)
    assert.equal(msg.type, 'error')
    cli.send('{"type": "subscribe"}')
    msg = await receiveWS(cli)
    assert.equal(msg.type, 'error')
  })

  it('Subscribe to channel', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    const msg = await receiveWS(cli)
    assert.equal(msg.type, 'subscribe-confirm')
    assert.equal(msg.channel, 'test_channel')
    const [, msg2] = await Promise.all([
      wsEmitter.emit('test_channel', 'test_data'),
      receiveWS(cli)
    ])
    assert.equal(msg2.type, 'message')
    assert.equal(msg2.channel, 'test_channel')
    assert.equal(msg2.data, 'test_data')
  })

  it.skip('Send lots of events', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    const msg = await receiveWS(cli)
    assert.equal(msg.type, 'subscribe-confirm')
    assert.equal(msg.channel, 'test_channel')
    const nbMessages = 10000
    const interval = 2
    let i = 1
    const allReceivedPromise = new Promise(resolve => {
      cli.on('message', res => {
        const msg = JSON.parse(res)
        assert.equal(msg.type, 'message')
        assert.equal(msg.channel, 'test_channel')
        i += 1
        if (i === nbMessages) resolve()
      })
    })
    for (const i of Array(nbMessages).keys()) {
      wsEmitter.emit('test_channel', 'test_data' + i)
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    await allReceivedPromise
  })

  it.skip('DCAT should preserve serialization of a valid example', async function () {
    const normalizedDcat = await dcatNormalize(cioExample)
    normalizedDcat['@context'] = cioExample['@context']
    assert.deepEqual(cioExample, normalizedDcat)
    const valid = dcatValidate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })

  it('Read a XML+RDF DCAT export', async function () {
    const normalizedDcat = await dcatNormalize(odsRdfExample, 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/exports/dcat')
    const valid = dcatValidate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })

  it('Validate a DCAT example with different serialization', async function () {
    const normalizedDcat = await dcatNormalize(semiceuExample)
    const valid = dcatValidate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })
})
