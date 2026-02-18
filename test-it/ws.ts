import { strict as assert } from 'node:assert'
import WebSocket from 'ws'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import config from 'config'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, anonymous, superadmin } from './utils/index.ts'

async function receive (cli) {
  const res = await eventPromise(cli, 'message')
  return JSON.parse(res)
}

describe('ws', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Connect to web socket server', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
  })

  it('Receive error when sending bad input', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send('{blabla}')
    let msg = await receive(cli)
    assert.equal(msg.type, 'error')
    cli.send('{"type": "subscribe"}')
    msg = await receive(cli)
    assert.equal(msg.type, 'error')
  })

  it('Subscribe to channel', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    const msg = await receive(cli)
    assert.equal(msg.type, 'subscribe-confirm')
    assert.equal(msg.channel, 'test_channel')
    const [, msg2] = await Promise.all([
      wsEmitter.emit('test_channel', 'test_data'),
      receive(cli)
    ])
    assert.equal(msg2.type, 'message')
    assert.equal(msg2.channel, 'test_channel')
    assert.equal(msg2.data, 'test_data')
  })

  it.skip('Send lots of events', async function () {
    const cli = new WebSocket(config.publicUrl)
    await eventPromise(cli, 'open')
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    const msg = await receive(cli)
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
})
