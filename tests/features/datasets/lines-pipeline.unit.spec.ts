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

// A real Writable (streamCsv uses transform.pipe(res)) with the express Response chaining helpers
// bolted on. Collects everything written and resolves `_done` with the concatenated bytes on end.
const fakeRes = () => {
  const res: any = new PassThrough()
  res.type = function () { return this }
  res.status = function () { return this }
  res.setHeader = function () { return this }
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
    const streamed = JSON.parse((await res._done).toString())

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
  })
})
