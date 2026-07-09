import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import path from 'node:path'

// The api result/csv modules import `#config` at module load (config.ts validates on import). The unit
// harness doesn't set NODE_CONFIG_DIR, so point node-config at the real api/config dir — same pattern
// as benchmark/src/micro/prepare-result-item.bench.ts — and load those modules via dynamic import
// (after this assignment) so config resolves. NODE_ENV defaults to 'development' inside node-config.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// A small finalized-like dataset with a few mixed-type fields incl `_id`.
const dataset: any = {
  id: 'ds1',
  slug: 'ds1',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  schema: [
    { key: '_id', type: 'string' },
    { key: 'label', type: 'string' },
    { key: 'count', type: 'integer' },
    { key: 'active', type: 'boolean' }
  ]
}

// ~3 hits, no aggregations, no next page. Second row exercises csv quoting (comma + quote + unicode).
const esResponse = () => ({
  hits: {
    total: { value: 3 },
    hits: [
      { _id: 'a', _score: null, sort: [0], _source: { label: 'alpha', count: 10, active: true } },
      { _id: 'b', _score: null, sort: [1], _source: { label: 'béta, "x"', count: 20, active: false } },
      { _id: 'c', _score: null, sort: [2], _source: { label: 'gamma', count: 30, active: true } }
    ]
  }
})

const publicBaseUrl = 'http://test.example'

// Load the config-dependent api modules once, after NODE_CONFIG_DIR is set.
const load = async () => ({
  ...await import('../../../api/src/datasets/routes/lines-source.ts'),
  ...await import('../../../api/src/datasets/routes/lines-pipeline.ts'),
  ...await import('../../../api/src/datasets/utils/flatten.ts'),
  esUtils: await import('../../../api/src/datasets/es/index.ts'),
  outputs: await import('../../../api/src/datasets/utils/outputs.ts'),
  ...await import('../../../api/src/misc/utils/query-advice.ts'),
  ...await import('../../../api/src/misc/utils/req-context.ts'),
  ...await import('../../../api/src/misc/utils/public-base-url.ts')
})

// A real Writable with the express Response chaining helpers bolted on, including a header map —
// sendPreparedParts reads back Content-Type (to append the charset the way res.send(string) did) and
// sets the ETag / Content-Length, so parity tests can assert them against the oracle. `endParts` is
// what res.throttleEnd installs in production (a hard contract of sendPreparedParts) — the fake's
// version is a plain write loop; `send` stands in for express's res.send, which sendPreparedParts
// delegates the `req.fresh` → 304 path to. Collects everything written and resolves `_done` with the
// concatenated bytes on end.
const fakeRes = () => {
  const res: any = new PassThrough()
  res._headers = {}
  res.type = function (t: string) { this._headers['content-type'] = 'application/' + t; return this }
  res.status = function (code: number) { this.statusCode = code; return this }
  res.setHeader = function (k: string, v: string) { this._headers[k.toLowerCase()] = v; return this }
  res.set = function (k: string, v: string) { this._headers[k.toLowerCase()] = v; return this }
  res.get = function (k: string) { return this._headers[k.toLowerCase()] }
  res.removeHeader = function (k: string) { delete this._headers[k.toLowerCase()] }
  res.send = function (body: any) { this.end(body); return this }
  res.endParts = function (parts: Buffer[]) { for (const part of parts) this.write(part); this.end() }
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  res._done = new Promise<Buffer>(resolve => res.on('end', () => resolve(Buffer.concat(chunks))))
  return res
}

test.describe('lines-pipeline parity', () => {
  test('streamJson deep-equals prepareResultItem output (incl hint)', async () => {
    const { bufferedSource, streamJson, getFlatten, esUtils, attachQueryHint, setReqDataset, setReqPublicBaseUrl } = await load()

    // hint=true forces the query hint so parity covers the hint field too.
    const query = { hint: 'true' }
    const req = { path: '/ds1/lines', query, __: (k: string) => k } as any
    setReqDataset(req, dataset)
    setReqPublicBaseUrl(req, publicBaseUrl)

    const res = fakeRes()
    await streamJson(req, res, bufferedSource(esResponse()), { publicBaseUrl, esSearchDurationMs: 0 })
    const rawBody = await res._done
    const streamed = JSON.parse(rawBody.toString())

    // the incrementally computed ETag: weak format carrying the exact body byte length (the hash part
    // is an opaque content fingerprint — see BodyAccumulator — asserted by its own unit spec), and the
    // charset that res.send(string) used to append must be reproduced
    const jsonEtag = res.get('ETag').match(/^W\/"([0-9a-f]+)-[A-Za-z0-9+/]{27}"$/)
    assert.ok(jsonEtag, `unexpected etag format: ${res.get('ETag')}`)
    assert.equal(parseInt(jsonEtag[1], 16), rawBody.length)
    assert.equal(res.get('Content-Type'), 'application/json; charset=utf-8')
    // Content-Length is set explicitly (express's res.send used to do it): without it Node would fall
    // back to chunked transfer encoding — an observable header change on the wire
    assert.equal(res.get('Content-Length'), String(rawBody.length))

    // reference built the CURRENT (buffered) way
    const esResp = esResponse()
    const ctx = esUtils.prepareResultContext(dataset, query)
    const flatten = getFlatten(dataset, (query as any).arrays === 'true')
    let ref: any = {
      total: esResp.hits.total.value,
      results: esResp.hits.hits.map(h => esUtils.prepareResultItem(h, dataset, query, flatten, publicBaseUrl, ctx))
    }
    ref = attachQueryHint(req, 0, ref)

    assert.ok(ref.hint, 'reference should carry a hint so this asserts hint parity')
    assert.deepEqual(streamed, ref)
  })

  test('streamCsv byte-equals results2csv', async () => {
    const { bufferedSource, streamCsv, getFlatten, esUtils, outputs, setReqDataset, setReqPublicBaseUrl } = await load()

    const query = { hint: 'true' }
    const req = { path: '/ds1/lines', query, __: (k: string) => k } as any
    setReqDataset(req, dataset)
    setReqPublicBaseUrl(req, publicBaseUrl)

    const res = fakeRes()
    await streamCsv(req, res, bufferedSource(esResponse()))
    const bytes = await res._done

    const esResp = esResponse()
    const ctx = esUtils.prepareResultContext(dataset, query)
    const flatten = getFlatten(dataset, (query as any).arrays === 'true')
    const referenceRows = esResp.hits.hits.map(h => esUtils.prepareResultItem(h, dataset, query, flatten, publicBaseUrl, ctx))
    const refCsv = await outputs.results2csv(req, referenceRows)

    assert.equal(bytes.toString(), refCsv)
    const csvEtag = res.get('ETag').match(/^W\/"([0-9a-f]+)-[A-Za-z0-9+/]{27}"$/)
    assert.ok(csvEtag, `unexpected etag format: ${res.get('ETag')}`)
    assert.equal(parseInt(csvEtag[1], 16), bytes.length)
    assert.equal(res.get('Content-Type'), 'application/csv; charset=utf-8')
    assert.equal(res.get('Content-Length'), String(bytes.length))
  })
})

// The parts are written sequentially instead of going through express's res.send, so the send-time
// semantics that used to live INSIDE res.send are either reproduced by sendPreparedParts (HEAD,
// Content-Length) or explicitly delegated back to res.send (`req.fresh` → 304 — express owns the
// header-stripping there; the 304 wire behavior is pinned end-to-end by cache-headers.api.spec.ts).
// Both go through streamJson so the assertions cover the real call path, not the helper in isolation.
test.describe('lines-pipeline send semantics (what res.send used to do)', () => {
  const makeReq = (extra: Record<string, any>) => ({ path: '/ds1/lines', query: {}, __: (k: string) => k, ...extra }) as any

  test('fresh request (If-None-Match matched) delegates the 304 to res.send with no body parts', async () => {
    const { bufferedSource, streamJson, setReqDataset, setReqPublicBaseUrl } = await load()
    const req = makeReq({ fresh: true })
    setReqDataset(req, dataset)
    setReqPublicBaseUrl(req, publicBaseUrl)

    const res = fakeRes()
    const sendCalls: any[] = []
    const passthroughSend = res.send.bind(res)
    res.send = (body: any) => { sendCalls.push(body); return passthroughSend(body) }
    await streamJson(req, res, bufferedSource(esResponse()), { publicBaseUrl, esSearchDurationMs: 0 })
    const rawBody = await res._done

    assert.equal(rawBody.length, 0, '304 must not carry a body')
    assert.deepEqual(sendCalls, [''], 'the empty-chunk res.send call express turns into the 304')
    assert.ok(res.get('ETag'), 'the etag is what the client revalidates against')
    assert.equal(res.get('Content-Length'), undefined, 'the real Content-Length must not be set on the fresh path')
  })

  test('HEAD gets the exact GET headers (ETag, Content-Length) and no body', async () => {
    const { bufferedSource, streamJson, setReqDataset, setReqPublicBaseUrl } = await load()

    // GET reference for the header values
    const getReq = makeReq({})
    setReqDataset(getReq, dataset)
    setReqPublicBaseUrl(getReq, publicBaseUrl)
    const getRes = fakeRes()
    await streamJson(getReq, getRes, bufferedSource(esResponse()), { publicBaseUrl, esSearchDurationMs: 0 })
    const getBody = await getRes._done

    const headReq = makeReq({ method: 'HEAD' })
    setReqDataset(headReq, dataset)
    setReqPublicBaseUrl(headReq, publicBaseUrl)
    const headRes = fakeRes()
    await streamJson(headReq, headRes, bufferedSource(esResponse()), { publicBaseUrl, esSearchDurationMs: 0 })
    const headBody = await headRes._done

    assert.equal(headBody.length, 0, 'HEAD must not carry a body')
    assert.equal(headRes.statusCode, 200)
    assert.equal(headRes.get('ETag'), getRes.get('ETag'))
    assert.equal(headRes.get('Content-Length'), String(getBody.length))
    assert.equal(headRes.get('Content-Type'), getRes.get('Content-Type'))
  })
})

test.describe('lines-pipeline error handling', () => {
  test('streamJson rejects on a source error before anything is sent (clean throw, no partial body)', async () => {
    const { streamJson, setReqDataset, setReqPublicBaseUrl } = await load()

    const req = { path: '/ds1/lines', query: {}, __: (k: string) => k } as any
    setReqDataset(req, dataset)
    setReqPublicBaseUrl(req, publicBaseUrl)

    const res = fakeRes()
    let ended = false
    res.on('end', () => { ended = true })

    const boom = new Error('source failure')
    const throwingSource = {
      total: 3 as number | undefined,
      hits: (async function * () {
        yield esResponse().hits.hits   // one bulk (array of hits)
        throw boom
      })(),
      tail: async () => esResponse()
    }

    // The body is assembled and only res.send at the very end, so a source error propagates BEFORE any
    // send — readLines/Express turns it into a clean HTTP error and nothing is written (no torn body, no
    // internalError bookkeeping needed). Contrast with the old incremental path that had to destroy res.
    await assert.rejects(streamJson(req, res, throwingSource, { publicBaseUrl, esSearchDurationMs: 0 }), /source failure/)
    assert.ok(!ended, 'nothing should have been sent to the client')
  })

  test('consumeHits destroys the source and rethrows when a row transform throws', async () => {
    const { consumeHits } = await load() as any

    let destroyed = false
    const source = {
      hits: (async function * () { yield [{ _id: 'a' }, { _id: 'b' }] })(),
      tail: async () => ({}),
      destroy: () => { destroyed = true }
    }
    await assert.rejects(consumeHits(source, () => { throw new Error('boom') }), /boom/)
    assert.ok(destroyed, 'the ES stream must be destroyed so the transport connection is released')
  })
})
