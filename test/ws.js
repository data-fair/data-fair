const assert = require('assert').strict
const WebSocket = require('ws')
const eventToPromise = require('event-to-promise')
const config = require('config')

async function receive(cli) {
  const res = await eventToPromise(cli, 'message')
  return JSON.parse(res.data)
}

describe('ws', () => {
  it('Connect to web socket server', async () => {
    const cli = new WebSocket(config.publicUrl)
    await eventToPromise(cli, 'open')
  })

  it('Receive error when sending bad input', async () => {
    const cli = new WebSocket(config.publicUrl)
    await eventToPromise(cli, 'open')
    cli.send('{blabla}')
    let msg = await receive(cli)
    assert.equal(msg.type, 'error')
    cli.send('{"type": "subscribe"}')
    msg = await receive(cli)
    assert.equal(msg.type, 'error')
  })

  it('Subscribe to channel', async () => {
    const cli = new WebSocket(config.publicUrl)
    await eventToPromise(cli, 'open')
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    let msg = await receive(cli)
    assert.equal(msg.type, 'subscribe-confirm')
    assert.equal(msg.channel, 'test_channel')
    await global.app.publish('test_channel', 'test_data')
    msg = await receive(cli)
    assert.equal(msg.type, 'message')
    assert.equal(msg.channel, 'test_channel')
    assert.equal(msg.data, 'test_data')
  })

  it.skip('Send lots of events', async () => {
    const cli = new WebSocket(config.publicUrl)
    await eventToPromise(cli, 'open')
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
      await global.app.publish('test_channel', 'test_data' + i)
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    await allReceivedPromise
  })
})
