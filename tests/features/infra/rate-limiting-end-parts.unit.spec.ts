import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { maxPendingSends } from '../../../api/src/misc/utils/throttle-wait.ts'

// The real res.endParts installed by res.throttleEnd (rate-limiting.ts), driven through the actual
// middleware. Pins the production incident of 2026-07: a client disconnecting while the /lines body was
// still being assembled left `res` destroyed by the time sendPreparedParts called res.endParts — on
// node >= 24 pipeline() then throws ERR_STREAM_UNABLE_TO_PIPE SYNCHRONOUSLY (bypassing its callback),
// so 1. the error escaped to the global handler (the internal-error spike) and 2. the send slot
// acquired by res.throttle leaked forever (the Throttle is never wired, its 'close' never fires) —
// after maxPendingSends aborted requests, EVERY later response of that client (per-IP bucket for
// anonymous) was torn down by the queue-full guard.

// rate-limiting.ts imports `#config` at module load: point node-config at the real api/config dir and
// load via dynamic import, same pattern as lines-pipeline.unit.spec.ts
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const load = async () => ({
  ...await import('../../../api/src/misc/utils/rate-limiting.ts'),
  session: (await import('@data-fair/lib-express/index.js')).session
})

// minimal express-like request: enough for the session middleware (headers/cookies) and the rate
// limiter (client ip via x-forwarded-for, req.get for the ignore-rate-limiting header)
const fakeReq = () => {
  const headers: Record<string, string> = { 'x-forwarded-for': '9.9.9.9' }
  return {
    headers,
    method: 'GET',
    query: {},
    socket: { remoteAddress: '9.9.9.9' },
    get (name: string) { return headers[name.toLowerCase()] },
    __: (key: string) => key // only used by the 429 paths — present so an unexpected 429 fails legibly
  } as any
}

// a real Writable so destroy/close/pipeline semantics are the genuine stream ones
const fakeRes = () => {
  const res: any = new PassThrough()
  res.status = function () { return this }
  res.type = function () { return this }
  res.send = function (body: any) { this.end(body); return this }
  return res
}

// run the session middleware (anonymous, no cookies — resolves without JWKS) then the rate-limiting
// middleware, then install the throttled end helpers like a /lines route does
const preparedRes = async (mod: Awaited<ReturnType<typeof load>>) => {
  const req = fakeReq()
  const res = fakeRes()
  await mod.session.middleware()(req, res, () => {})
  await mod.middleware(req, res, () => {})
  res.throttleEnd()
  return res
}

test.describe('res.endParts on a torn-down response', () => {
  test('does not throw when the client disconnected during body assembly', async () => {
    const mod = await load()
    mod.clear()
    const res = await preparedRes(mod)
    res.destroy() // client disconnects while the body is still being assembled
    // before the fix: pipeline() throws ERR_STREAM_UNABLE_TO_PIPE synchronously
    res.endParts([Buffer.from('part1'), Buffer.from('part2')])
  })

  test('does not leak send slots (queue-full starvation guard)', async () => {
    const mod = await load()
    mod.clear()
    // one more aborted send than the cap: if each one leaks its slot, the client's bucket is
    // permanently saturated and every later response is torn down by the queue-full guard
    for (let i = 0; i <= maxPendingSends; i++) {
      // stay under the request-count limit (100/s in the dev config this spec runs with): pause one
      // refill window partway through the loop — this test is about the bandwidth send slots, not 429s
      if (i === maxPendingSends - 10) await new Promise(resolve => setTimeout(resolve, 1100))
      const res = await preparedRes(mod)
      res.destroy()
      try { res.endParts([Buffer.from('x')]) } catch {} // swallow the pre-fix sync throw: this test pins the leak
    }
    // a live response from the same client must still be served
    const res = await preparedRes(mod)
    const body = new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      res.on('close', () => reject(new Error('response was torn down: leaked send slots exhausted the client bucket')))
    })
    res.endParts([Buffer.from('hello '), Buffer.from('world')])
    assert.equal(await body, 'hello world')
  })
})
