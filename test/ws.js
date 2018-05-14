const WebSocket = require('ws')
const eventToPromise = require('event-to-promise')

const testUtils = require('./resources/test-utils')

const {test, config} = testUtils.prepare(__filename)

async function receive(cli) {
  const res = await eventToPromise(cli, 'message')
  return JSON.parse(res.data)
}

test('Connect to web socket server', async t => {
  const cli = new WebSocket(config.publicUrl)
  await eventToPromise(cli, 'open')
  t.pass()
})

test('Receive error when sending bad input', async t => {
  const cli = new WebSocket(config.publicUrl)
  await eventToPromise(cli, 'open')
  cli.send('{blabla}')
  let msg = await receive(cli)
  t.is(msg.type, 'error')
  cli.send('{"type": "subscribe"}')
  msg = await receive(cli)
  t.is(msg.type, 'error')
})

test('Subscribe to channel', async t => {
  const cli = new WebSocket(config.publicUrl)
  await eventToPromise(cli, 'open')
  cli.send(JSON.stringify({type: 'subscribe', channel: 'test_channel'}))
  let msg = await receive(cli)
  t.is(msg.type, 'subscribe-confirm')
  t.is(msg.channel, 'test_channel')
  await test.app.publish('test_channel', 'test_data')
  msg = await receive(cli)
  t.is(msg.type, 'message')
  t.is(msg.channel, 'test_channel')
  t.is(msg.data, 'test_data')
})

test.skip('Send lots of events', async t => {
  const cli = new WebSocket(config.publicUrl)
  await eventToPromise(cli, 'open')
  cli.send(JSON.stringify({type: 'subscribe', channel: 'test_channel'}))
  let msg = await receive(cli)
  t.is(msg.type, 'subscribe-confirm')
  t.is(msg.channel, 'test_channel')
  const nbMessages = 10000
  const interval = 2
  let i = 1
  const allReceivedPromise = new Promise(resolve => {
    cli.on('message', res => {
      const msg = JSON.parse(res)
      t.is(msg.type, 'message')
      t.is(msg.channel, 'test_channel')
      i += 1
      if (i === nbMessages) resolve()
    })
  })
  for (let i of Array(nbMessages).keys()) {
    await test.app.publish('test_channel', 'test_data' + i)
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  await allReceivedPromise
})
