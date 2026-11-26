import { UndiciConnection } from '@elastic/elasticsearch'

// The transport destroys the body of a response it refuses (content-length above maxResponseSize)
// without listening to it, and undici then emits an 'error' event on that body: unhandled, it exits
// the process. Listening on every body keeps that error local; whoever reads a body (the transport's
// async iteration, a stream pipeline) still receives its errors through its own handling.
export class GuardedUndiciConnection extends UndiciConnection {
  constructor (opts: ConstructorParameters<typeof UndiciConnection>[0]) {
    super(opts)
    const pool: any = this.pool
    const request = pool.request.bind(pool)
    pool.request = (opts: any, callback?: any) => {
      if (callback) return request(opts, callback)
      return request(opts).then((response: any) => {
        response.body?.on('error', () => {})
        return response
      })
    }
  }
}
