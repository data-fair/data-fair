const WebSocket = require('ws')
const eventToPromise = require('event-to-promise')

const testUtils = require('./resources/test-utils')

const [test, config] = testUtils.prepare(__filename)

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
  test.app.publish('test_channel', 'test_data')
  msg = await receive(cli)
  t.is(msg.type, 'message')
  t.is(msg.channel, 'test_channel')
  t.is(msg.data, 'test_data')
})
