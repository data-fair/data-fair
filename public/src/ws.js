import Vue from 'vue'
import ReconnectingWebSocket from 'reconnecting-websocket'

const eventBus = module.exports = new Vue()
if (window.WebSocket) {
  const ws = new ReconnectingWebSocket(window.CONFIG.wsPublicUrl)
  eventBus.$on('subscribe', channel => ws.send(JSON.stringify({type: 'subscribe', channel})))
  eventBus.$on('unsubscribe', channel => ws.send(JSON.stringify({type: 'unsubscribe', channel})))
  ws.onmessage = event => {
    const body = JSON.parse(event.data)
    if (body.type === 'message') {
      eventBus.$emit(body.channel, body.data)
    }
  }
}
