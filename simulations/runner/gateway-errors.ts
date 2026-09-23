/**
 * Tell a provider failure apart from a product failure.
 *
 * When the model stream dies — a rate limit, a dead bridge, an unknown model —
 * the agents gateway does not fail the HTTP request. It writes an error chunk
 * into the SSE body and closes cleanly (api/src/gateway/router.ts). The chat
 * then renders that as an alert, the Stop button goes away, `waitForTurn`
 * returns normally and nothing throws. The run looks valid, the judge reads a
 * transcript of an assistant that never answered, and reports the product as
 * unsatisfactory for something the harness did to it.
 *
 * So we read the gateway's own protocol instead of the screen: the `error`
 * field of a chunk, which is a JSON shape the service emits, not prose. It
 * survives translation, restyling and any rewording of the message itself —
 * unlike matching on what the alert says, which is why that approach was
 * rejected.
 */
import type { Page, Response } from '@playwright/test'

export type GatewayErrors = {
  /** Messages from every error chunk seen, in arrival order. */
  messages: string[]
  /** Await the in-flight body reads before deciding a run's validity. */
  settle: () => Promise<void>
}

/** Pull the error messages out of one SSE body, ignoring everything else. */
export function errorsInSseBody (body: string): string[] {
  const found: string[] = []
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const message = JSON.parse(payload)?.error?.message
      if (typeof message === 'string' && message) found.push(message)
    } catch {
      // A chunk that is not JSON is a normal content delta, not a signal.
    }
  }
  return found
}

export function captureGatewayErrors (page: Page): GatewayErrors {
  const messages: string[] = []
  const pending: Promise<unknown>[] = []

  page.on('response', (res: Response) => {
    if (!res.url().includes('/v1/chat/completions')) return
    // Bodies are read off the event loop and awaited later: reading here would
    // block the handler on a stream that has not finished, and a listener that
    // never returns stalls Playwright's event dispatch.
    pending.push(
      res.text()
        .then(body => { messages.push(...errorsInSseBody(body)) })
        // An unreadable body (navigated away, aborted) is not evidence of an
        // error — only a parsed error chunk is.
        .catch(() => {})
    )
  })

  return { messages, settle: async () => { await Promise.allSettled(pending) } }
}
