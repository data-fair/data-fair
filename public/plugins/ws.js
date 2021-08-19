import ReconnectingWebSocket from 'reconnecting-websocket'
import eventBus from '~/event-bus'

function configureWS (wsUrl, suffix = '') {
  console.log('Configure WS', wsUrl)
  if (window.WebSocket) {
    const ws = new ReconnectingWebSocket(wsUrl)
    const subscriptions = {}
    let ready = false
    ws.addEventListener('open', () => {
      ready = true
      Object.keys(subscriptions).forEach(channel => {
        if (subscriptions[channel]) ws.send(JSON.stringify({ type: 'subscribe', channel }))
        else ws.send(JSON.stringify({ type: 'unsubscribe', channel }))
      })
    })
    ws.addEventListener('close', () => {
      ready = false
    })

    eventBus.$on('subscribe' + suffix, channel => {
      subscriptions[channel] = true
      if (ready) ws.send(JSON.stringify({ type: 'subscribe', channel }))
    })
    eventBus.$on('unsubscribe' + suffix, channel => {
      subscriptions[channel] = false
      if (ready) ws.send(JSON.stringify({ type: 'unsubscribe', channel }))
    })

    ws.onmessage = event => {
      const body = JSON.parse(event.data)
      if (body.type === 'message') {
        eventBus.$emit(body.channel, body.data)
      }
      if (body.type === 'error' && body.data === 'authentication is required') {
        ws.close()
        // console.log(body)
        // eventBus.$emit(body.channel, body.data)
      }
    }
  }
}

export default ({ store, env }) => {
  // reconstruct this env var that we used to have but lost when implementing multi-domain exposition
  const wsPublicUrl = (window.location.origin + env.basePath)
    .replace('http:', 'ws:').replace('https:', 'wss:')
  configureWS(wsPublicUrl)
  // TODO: the same for notifyUrl ?
  // if (env.notifyWSUrl) configureWS(env.notifyWSUrl, '-notify')
}
