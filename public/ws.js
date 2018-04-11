import ReconnectingWebSocket from 'reconnecting-websocket'
import eventBus from './event-bus.js'

if (window.WebSocket) {
  const ws = new ReconnectingWebSocket(this.env.wsPublicUrl)
  const subscriptions = {}
  let ready = false
  ws.addEventListener('open', () => {
    ready = true
    Object.keys(subscriptions).forEach(channel => {
      if (subscriptions[channel]) ws.send(JSON.stringify({type: 'subscribe', channel}))
      else ws.send(JSON.stringify({type: 'unsubscribe', channel}))
    })
  })
  ws.addEventListener('close', () => {
    ready = false
  })

  eventBus.$on('subscribe', channel => {
    subscriptions[channel] = true
    if (ready) ws.send(JSON.stringify({type: 'subscribe', channel}))
  })
  eventBus.$on('unsubscribe', channel => {
    subscriptions[channel] = false
    if (ready) ws.send(JSON.stringify({type: 'unsubscribe', channel}))
  })

  ws.onmessage = event => {
    const body = JSON.parse(event.data)
    if (body.type === 'message') {
      eventBus.$emit(body.channel, body.data)
    }
  }
}
