import { WsClient } from '@data-fair/lib-node/ws-client.js'
import { EventEmitter } from 'node:events'
import { wsUrl, apiUrl } from './axios.ts'

const log = { info: async () => {}, error: console.error, debug: () => {} }

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

/**
 * Connect to the test-env SSE stream and collect events.
 * Returns an EventEmitter that emits 'notification', 'extension-inputs', etc.
 * Call .close() when done.
 */
export class TestEventClient extends EventEmitter {
  private controller: AbortController
  /** Resolves when the SSE connection is established and ready to receive events. */
  ready: Promise<void>

  constructor () {
    super()
    this.controller = new AbortController()
    let resolveReady: () => void
    this.ready = new Promise(resolve => { resolveReady = resolve })
    this._connect(resolveReady!).catch(() => {})
  }

  private async _connect (onReady: () => void) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/test-env/events`, {
        signal: this.controller.signal,
        headers: { Accept: 'text/event-stream' }
      })
      if (!res.body) throw new Error('No response body from SSE endpoint')
      onReady()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE messages from buffer
        const parts = buffer.split('\n\n')
        buffer = parts.pop()! // keep incomplete last part
        for (const part of parts) {
          let eventType = 'message'
          let data = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (data) {
            try {
              this.emit(eventType, JSON.parse(data))
            } catch {
              this.emit(eventType, data)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('TestEventClient error:', err)
      }
    }
  }

  close () {
    this.controller.abort()
  }
}

/**
 * Wait for a specific test event (notification, extension-inputs, etc.).
 * Opens an SSE connection, waits for the first matching event, then closes.
 */
export const waitForTestEvent = async (
  eventType: string,
  filter?: (data: any) => boolean,
  timeout = 30000
): Promise<any> => {
  const client = new TestEventClient()
  await client.ready
  try {
    return await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.close()
        reject(new Error(`waitForTestEvent timeout after ${timeout}ms waiting for "${eventType}"`))
      }, timeout)
      client.on(eventType, (data: any) => {
        if (!filter || filter(data)) {
          clearTimeout(timer)
          client.close()
          resolve(data)
        }
      })
    })
  } catch (err) {
    client.close()
    throw err
  }
}
