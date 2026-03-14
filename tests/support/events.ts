import { WsClient } from '@data-fair/lib-node/ws-client.js'
import { wsUrl } from './axios.ts'

const log = { info: async (...args: any[]) => console.log(...args), error: console.error, debug: console.debug }

/**
 * Wait for a WebSocket message matching a filter on a given channel.
 */
export const waitForWsEvent = async (
  channel: string,
  filter?: (data: any) => boolean,
  timeout = 30000
): Promise<any> => {
  const wsClient = new WsClient({ url: wsUrl, log })
  try {
    return await wsClient.waitFor(channel, filter, timeout)
  } finally {
    wsClient.close()
  }
}

/**
 * Subscribe to a WS channel and return a collector object.
 * Call collector.stop() when done to close the WebSocket.
 * Access collected events via collector.events.
 */
export const collectWsEvents = (
  channel: string
): { events: any[], stop: () => void } => {
  const events: any[] = []
  const wsClient = new WsClient({ url: wsUrl, log })

  wsClient.subscribe(channel)
  wsClient.on('message', (msg: any) => {
    if (msg.channel !== channel) return
    if (msg.type === 'subscribe-confirm') return
    events.push(msg.data)
  })

  return {
    events,
    stop: () => wsClient.close()
  }
}
