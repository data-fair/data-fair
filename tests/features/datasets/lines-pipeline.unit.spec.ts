import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import path from 'node:path'
import etag from 'etag'

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

// A real Writable (streamCsv uses transform.pipe(res)) with the express Response chaining helpers
// bolted on, including a header map — sendPrepared reads back Content-Type (to append the charset the
// way res.send(string) did) and sets the ETag, so parity tests can assert both against the oracle.
// Collects everything written and resolves `_done` with the concatenated bytes on end.
const fakeRes = () => {
  const res: any = new PassThrough()
  res._headers = {}
  res.type = function (t: string) { this._headers['content-type'] = 'application/' + t; return this }
  res.status = function () { return this }
  res.setHeader = function (k: string, v: string) { this._headers[k.toLowerCase()] = v; return this }
  res.set = function (k: string, v: string) { this._headers[k.toLowerCase()] = v; return this }
  res.get = function (k: string) { return this._headers[k.toLowerCase()] }
  res.send = function (body: any) { this.end(body); return this }
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

    // the incrementally computed ETag must equal what Express's res.send(string) would have generated,
    // and the charset res.send(string) appended must be reproduced
    assert.equal(res.get('ETag'), etag(rawBody.toString(), { weak: true }))
    assert.equal(res.get('Content-Type'), 'application/json; charset=utf-8')

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
    assert.equal(res.get('ETag'), etag(bytes.toString(), { weak: true }))
    assert.equal(res.get('Content-Type'), 'application/csv; charset=utf-8')
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
