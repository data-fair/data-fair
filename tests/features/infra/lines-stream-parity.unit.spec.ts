import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'node:stream'
import path from 'node:path'

// The pipeline modules import `#config` (validated at import) and the result/csv serializers. Point
// node-config at the real api/config dir and load the config-dependent modules via dynamic import
// AFTER this assignment — same pattern as lines-pipeline.unit.spec.ts. NODE_ENV stays 'development'.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// Deterministic PRNG (no Math.random / Date.now anywhere in generation) — same seed → same case.
function mulberry32 (seed: number) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// A schema wide enough to exercise every streamable derived-field path: markdown (html=), image
// (thumbnail=), a separator field (arrays=), a description, plus primitives for csv coverage.
const dataset: any = {
  id: 'parity-ds',
  slug: 'parity-ds',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  schema: [
    { key: '_id', type: 'string' },
    { key: 'label', type: 'string' },
    { key: 'body', type: 'string', 'x-display': 'markdown' },
    { key: 'note', type: 'string', 'x-refersTo': 'http://schema.org/description' },
    { key: 'img', type: 'string', 'x-refersTo': 'http://schema.org/image' },
    { key: 'tags', type: 'string', separator: ',' },
    { key: 'count', type: 'integer' },
    { key: 'active', type: 'boolean' }
  ]
}

const publicBaseUrl = 'http://parity.example'

// A single hit, with a random `_source` and (sometimes) an ES `highlight` block. All values are JSON
// round-trip stable so `JSON.parse(JSON.stringify(hit))` is an identity — that is the whole premise of
// the parity claim: the two SOURCES differ only by an extra parse/serialize step on the streamed side.
const genHit = (r: () => number, i: number) => {
  const src: any = {
    label: r() < 0.5 ? `l\n★ "${i}", }{` : `plain ${i}`,
    body: `# Title ${i}\n\n**bold** and _em_ with <b>x</b> & a [link](http://x/${i})`,
    note: `note ${i} with, comma and "quote"`,
    img: `${publicBaseUrl}/api/v1/datasets/parity-ds/attachments/pic-${i}.png`,
    tags: `a${i % 3},b]c,q\\z`,
    count: (i * 2654435761) % 1000000,
    active: r() < 0.5
  }
  // occasionally drop some optional fields → null cells / no thumbnail
  if (r() < 0.2) delete src.img
  if (r() < 0.2) delete src.note
  const hit: any = { _id: `id-${i}`, _score: r() < 0.5 ? null : Number((r() * 5).toFixed(3)), sort: [i], _source: src }
  if (r() < 0.5) hit.highlight = { 'label.text': [`<em class="highlighted">l</em> ${i}`], 'label.text_standard': [`<em class="highlighted">L</em> ${i}`] }
  return hit
}

// Full ES `_search` envelope, identical shape to the splitter/search-stream fuzz tests.
const envelope = (hits: any[], aggs?: any) => ({ took: 3, timed_out: false, _shards: { total: 1, successful: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits }, ...(aggs ? { aggregations: aggs } : {}) })

// Derive a randomized query that toggles the streamable derived-field params.
const genQuery = (r: () => number): Record<string, any> => {
  const q: Record<string, any> = {}
  if (r() < 0.5) q.highlight = 'label'
  if (r() < 0.5) q.truncate = String(4 + Math.floor(r() * 40))
  if (r() < 0.5) q.html = r() < 0.5 ? 'true' : 'vuetify'
  if (r() < 0.5) q.thumbnail = '300x200'
  if (r() < 0.5) q.arrays = 'true'
  if (r() < 0.4) q.hint = 'true'
  if (r() < 0.3) q.select = 'label,count,tags'
  return q
}

const gen = (seed: number) => {
  const r = mulberry32(seed)
  const n = Math.floor(r() * 30) // 0..29 hits
  const hits = Array.from({ length: n }, (_, i) => genHit(r, i))
  const query = genQuery(r)
  let aggs: any
  if (r() < 0.5) { query.collapse = 'label'; aggs = { totalCollapse: { value: Math.max(1, Math.floor(r() * n) + 1) } } }
  const chunk = 1 + Math.floor(r() * 80) // tiny → large chunk sizes drive splitter boundaries
  return { hits, query, esResponse: envelope(hits, aggs), chunk }
}

// A Node Readable that emits the buffer in fixed-size chunks (drives the splitter across boundaries).
const chunked = (buf: Buffer, size: number) => Readable.from((function * () { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size) })())

// A real Writable with the express Response chaining helpers bolted on (mirrors lines-pipeline.unit.spec).
const fakeRes = () => {
  const res: any = new PassThrough()
  res.type = function () { return this }
  res.status = function () { return this }
  res.setHeader = function () { return this }
  res.set = function () { return this }
  res.send = function (body: any) { this.end(body); return this }
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  res._done = new Promise<Buffer>(resolve => res.on('end', () => resolve(Buffer.concat(chunks))))
  return res
}

const load = async () => ({
  ...await import('../../../api/src/datasets/routes/lines-source.ts'),
  ...await import('../../../api/src/datasets/routes/lines-pipeline.ts'),
  streamToSource: (await import('../../../api/src/datasets/es/hits-stream.ts')).streamToSource,
  ...await import('../../../api/src/misc/utils/req-context.ts'),
  ...await import('../../../api/src/misc/utils/public-base-url.ts')
})

test.describe('lines-stream parity: buffered source vs streamed source through the shared pipeline', () => {
  test('streamJson is deep-equal across 120 randomized shapes', async () => {
    const { bufferedSource, streamJson, streamToSource, setReqDataset, setReqPublicBaseUrl } = await load() as any

    for (let seed = 1; seed <= 120; seed++) {
      const { esResponse, query, chunk } = gen(seed)
      const req = { path: '/parity-ds/lines', query, __: (k: string) => k } as any
      setReqDataset(req, dataset)
      setReqPublicBaseUrl(req, publicBaseUrl)

      // Serialize to bytes FIRST (pristine) so the streamed source parses data untouched by the
      // buffered run's in-place transforms.
      const buf = Buffer.from(JSON.stringify(esResponse))
      const ctx = { publicBaseUrl, esSearchDurationMs: 0 }

      const resBuf = fakeRes()
      await streamJson(req, resBuf, bufferedSource(esResponse), ctx)
      const bufferedOut = JSON.parse((await resBuf._done).toString())

      const resStr = fakeRes()
      await streamJson(req, resStr, await streamToSource(chunked(buf, chunk)), ctx)
      const streamedOut = JSON.parse((await resStr._done).toString())

      assert.deepEqual(streamedOut, bufferedOut, `seed ${seed} (chunk ${chunk}, query ${JSON.stringify(query)})`)
    }
  })

  test('_attachment_url: streamed pipeline-side rewrite equals buffered search-side rewrite', async () => {
    // The streamed/collect-small sources hold the RAW stored `_attachment_url` (searchStream does not
    // rewrite), so the pipeline must rewrite it via ctx.rewriteAttachmentUrl to match the buffered path,
    // where search() already rewrote it on the source before the pipeline (ctx.rewriteAttachmentUrl false).
    const { bufferedSource, streamJson, streamToSource, setReqDataset, setReqPublicBaseUrl } = await load() as any
    const { rewriteAttachmentUrl } = await import('../../../api/src/datasets/es/commons.ts') as any
    const config = (await import('../../../api/src/config.ts')).default as any

    for (const isVirtual of [false, true]) {
      const ds = { id: 'att-ds', slug: 'att-ds', isVirtual, schema: [{ key: '_id', type: 'string' }, { key: 'label', type: 'string' }, { key: '_attachment_url', type: 'string' }] }
      // Stored URL as ES holds it: absolute, based on config.publicUrl. For a virtual dataset the path
      // points at the CHILD dataset's attachments, which the rewrite reroutes through the virtual dataset.
      const childId = isVirtual ? 'child-ds' : 'att-ds'
      const stored = (i: number) => `${config.publicUrl}/api/v1/datasets/${childId}/attachments/file-${i}.pdf`
      const hits = Array.from({ length: 5 }, (_, i) => ({ _id: `id-${i}`, _score: null, sort: [i], _source: { label: `l${i}`, _attachment_url: stored(i) } }))

      const req = { path: '/att-ds/lines', query: {}, __: (k: string) => k } as any
      setReqDataset(req, ds)
      setReqPublicBaseUrl(req, publicBaseUrl)
      const ctxBase = { publicBaseUrl, esSearchDurationMs: 0 }

      // BUFFERED reference: search() rewrites the source up front → pipeline does NOT rewrite.
      const searchHits = hits.map(h => ({ ...h, _source: { ...h._source, _attachment_url: rewriteAttachmentUrl(h._source._attachment_url, ds, publicBaseUrl) } }))
      const resBuf = fakeRes()
      await streamJson(req, resBuf, bufferedSource(envelope(searchHits)), { ...ctxBase, rewriteAttachmentUrl: false })
      const bufferedOut = JSON.parse((await resBuf._done).toString())

      // STREAMED: raw stored URLs → pipeline rewrites (ctx.rewriteAttachmentUrl true).
      const buf = Buffer.from(JSON.stringify(envelope(hits)))
      const resStr = fakeRes()
      await streamJson(req, resStr, await streamToSource(chunked(buf, 7)), { ...ctxBase, rewriteAttachmentUrl: true })
      const streamedOut = JSON.parse((await resStr._done).toString())

      assert.deepEqual(streamedOut, bufferedOut, `isVirtual=${isVirtual}`)
      // prove the rewrite actually fired (regression guard: a missing ctx flag would leave the raw URL)
      assert.ok(streamedOut.results[0]._attachment_url.startsWith(publicBaseUrl), `rewritten to publicBaseUrl (isVirtual=${isVirtual})`)
      assert.ok(!streamedOut.results[0]._attachment_url.startsWith(config.publicUrl + '/api/'), `raw stored origin replaced (isVirtual=${isVirtual})`)
    }
  })

  test('streamCsv is byte-equal across 120 randomized shapes', async () => {
    const { bufferedSource, streamCsv, streamToSource, setReqDataset, setReqPublicBaseUrl } = await load() as any

    for (let seed = 1001; seed <= 1120; seed++) {
      const { esResponse, query, chunk } = gen(seed)
      const req = { path: '/parity-ds/lines', query, __: (k: string) => k } as any
      setReqDataset(req, dataset)
      setReqPublicBaseUrl(req, publicBaseUrl)

      const buf = Buffer.from(JSON.stringify(esResponse))

      const resBuf = fakeRes()
      await streamCsv(req, resBuf, bufferedSource(esResponse))
      const bufferedBytes = await resBuf._done

      const resStr = fakeRes()
      await streamCsv(req, resStr, await streamToSource(chunked(buf, chunk)))
      const streamedBytes = await resStr._done

      assert.equal(streamedBytes.toString('hex'), bufferedBytes.toString('hex'), `seed ${seed} (chunk ${chunk}, query ${JSON.stringify(query)})`)
    }
  })
})
