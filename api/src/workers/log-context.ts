// Carries the log context of a resource task from the main thread to the worker thread.
// Config-free on purpose: importable from worker threads and unit tests.
import { withLogContext } from '@data-fair/lib-node/log.js'
import type { LogContext } from '@data-fair/lib-node/log.js'

export type TaskPayload<R> = { resource: R, logContext: LogContext }

export function resourceTask<R, T> (fn: (resource: R) => Promise<T> | T): (payload: TaskPayload<R>) => Promise<T> | T {
  return (payload) => withLogContext(payload.logContext, () => fn(payload.resource))
}
