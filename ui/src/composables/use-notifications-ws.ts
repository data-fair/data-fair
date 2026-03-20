import { onScopeDispose } from 'vue'

export const useNotificationsWS = (eventsUrl: string, userId: string, onNotification: (notif: any) => void) => {
  // useWS is scoped to /data-fair/ channels; for events service we need a direct WebSocket
  const wsUrl = eventsUrl.replace(/^http/, 'ws') + '/ws'
  let ws: WebSocket | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  function connect () {
    ws = new WebSocket(wsUrl)
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: 'subscribe', channel: `user:${userId}:notifications` }))
    }
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.channel === `user:${userId}:notifications`) {
          onNotification(data.data)
        }
      } catch {}
    }
    ws.onclose = () => {
      reconnectTimeout = setTimeout(connect, 5000)
    }
  }

  connect()

  // Cleanup
  onScopeDispose(() => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    ws?.close()
  })
}
