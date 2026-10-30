// Carries the log context of a resource task from the main thread to the worker thread.
// Config-free on purpose: importable from worker threads and unit tests.
import { withLogContext } from '@data-fair/lib-node/log.js'
import type { LogContext } from '@data-fair/lib-node/log.js'

export type TaskPayload<R> = { resource: R, logContext: LogContext }

// memoized per-thread initialisation (connections, events queue, imports of modules that create
// pools or timers at load), retried by the next task after a failure
export function threadInit (fn: () => Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined
  return () => {
    if (!promise) {
      promise = fn().catch((err) => {
        promise = undefined
        throw err
      })
    }
    return promise
  }
}

// init runs before entering the task's log context: long-lived resources it creates must not
// capture the context of the first task of the thread (see the context rules of lib-node/log.js)
export function resourceTask<R, T> (fn: (resource: R) => Promise<T> | T, init?: () => Promise<void>): (payload: TaskPayload<R>) => Promise<T> | T {
  if (!init) return (payload) => withLogContext(payload.logContext, () => fn(payload.resource))
  return async (payload) => {
    await init()
    return withLogContext(payload.logContext, () => fn(payload.resource))
  }
}
