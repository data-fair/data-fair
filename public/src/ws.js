import Vue from 'vue'
import ReconnectingWebSocket from 'reconnecting-websocket'

const eventBus = module.exports = new Vue({data: {ready: false}})
if (window.WebSocket) {
  const ws = new ReconnectingWebSocket(window.CONFIG.wsPublicUrl)
  const subscriptions = {}
  ws.addEventListener('open', () => {
    eventBus.ready = true
    Object.keys(subscriptions).forEach(channel => {
      if (subscriptions[channel]) ws.send(JSON.stringify({type: 'subscribe', channel}))
      else ws.send(JSON.stringify({type: 'unsubscribe', channel}))
    })
  })
  ws.addEventListener('close', () => {
    eventBus.ready = false
  })

  eventBus.$on('subscribe', channel => {
    subscriptions[channel] = true
    if (eventBus.ready) ws.send(JSON.stringify({type: 'subscribe', channel}))
  })
  eventBus.$on('unsubscribe', channel => {
    subscriptions[channel] = false
    if (eventBus.ready) ws.send(JSON.stringify({type: 'unsubscribe', channel}))
  })

  ws.onmessage = event => {
    const body = JSON.parse(event.data)
    if (body.type === 'message') {
      eventBus.$emit(body.channel, body.data)
    }
  }
}
