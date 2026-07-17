import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

// Regression coverage for the streamed `/lines` read path — since the experimental flag was retired,
// json/csv/geojson requests ALWAYS read ES with asStream + the splitter, and the pipeline serializes rows
// on the fly before sending the assembled body. These tests pin the full response contract of that path
// (envelope, pagination Link header + body `next`, collapse, count=false pages, error path) with absolute
// assertions. Byte-parity between the streamed and buffered sources stays enforced at the unit level by
// lines-stream-parity.unit.spec.ts (the buffered source still backs unrecognized `format` values).

const testUser1 = await axiosAuth('test_user1@test.com')

const esHost = `localhost:${process.env.ES_PORT}`
const indicesPrefix = 'dataset-development'

const N = 2500
const id = 'streamlines'

// Deterministic rows: zero-padded `_id` so `sort=_id` is a stable total order; `grp` gives ~10 distinct
// values for the collapse test; `lat`/`lon` make the geojson format exercise real geo.
const pad = (i: number) => String(i).padStart(5, '0')
const rows = Array.from({ length: N }, (_, i) => ({
  _id: pad(i),
  str: i % 7 === 0 ? `has,comma "${i}"` : `label ${i}`,
  grp: 'g' + (i % 10),
  lat: 47 + (i % 50) * 0.001,
  lon: -2 + (i % 50) * 0.001,
  n: i
}))

test.describe('streamed /lines read path', () => {
  test.beforeAll(async () => {
    await clean()
    // the 2500 rows (~230KB) exceed the default store_bytes limit (200KB). Without an explicit limit the
    // setup only passes by racing the async consumption update between bulk chunks — set a high limit so
    // checkStorage never (correctly!) rejects a chunk with 429.
    await testUser1.post('/api/v1/limits/user/test_user1',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })
    await testUser1.put('/api/v1/datasets/' + id, {
      isRest: true,
      title: id,
      schema: [
        { key: 'str', type: 'string' },
        { key: 'grp', type: 'string' },
        { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
        { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' },
        { key: 'n', type: 'integer' }
      ]
    })
    // bulk-insert N rows (chunked to keep each request reasonable), then wait for finalize.
    for (let i = 0; i < rows.length; i += 1000) {
      const res: any = await testUser1.post(`/api/v1/datasets/${id}/_bulk_lines`, rows.slice(i, i + 1000))
      assert.equal(res.data.nbOk, rows.slice(i, i + 1000).length)
    }
    await waitForFinalize(testUser1, id, 30000)
  })

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const base = `/api/v1/datasets/${id}/lines`

  test('json: full envelope (results + total + body next + Link header)', async () => {
    const res = await testUser1.get(`${base}?format=json&size=2500&sort=_id`)

    assert.equal(res.status, 200)
    assert.equal(res.data.total, N)
    assert.equal(res.data.results.length, N)
    // strictly increasing _id ordering proves nothing was dropped/duplicated by the splitter
    for (let i = 0; i < res.data.results.length; i++) assert.equal(res.data.results[i]._id, pad(i))

    // full page (total === size) → a body `next` AND the matching Link header
    assert.ok(res.data.next, 'a full page carries a body next')
    assert.ok(res.headers.link, 'a full page sets a Link:next header')
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
  })

  test('csv: header + all rows, csv content-type', async () => {
    const res = await testUser1.get(`${base}?format=csv&size=2500&sort=_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8')
    const body = Buffer.from(res.data).toString()
    // prologue (header line) + N rows, each on its own line
    const lines = body.split('\n').filter(l => l.length)
    assert.equal(lines.length, N + 1)
    assert.ok(lines[0].includes('str'), 'first line is the csv header')
    // a value with comma + quotes survives the compiled serializer's escaping
    assert.ok(body.includes('"has,comma ""0"""'), 'csv escaping of commas/quotes is intact')
  })

  test('hint: a hint=true large request carries a hint', async () => {
    const res = await testUser1.get(`${base}?format=json&size=2500&sort=_id&hint=true`)
    assert.ok(res.data.hint, 'a hint=true large request should carry a hint')
  })

  test('collapse: totalCollapse is present in the envelope', async () => {
    const res = await testUser1.get(`${base}?format=json&size=2500&sort=_id&collapse=grp`)
    assert.equal(res.data.totalCollapse, 10) // 10 distinct grp values
    assert.equal(res.data.results.length, 10) // one row per collapsed group
  })

  test('geojson: FeatureCollection with bbox and the Link header', async () => {
    const res = await testUser1.get(`${base}?format=geojson&size=100&sort=_id`)
    assert.equal(res.status, 200)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 100)
    assert.ok(Array.isArray(res.data.bbox), 'bboxAgg result is appended to the FeatureCollection')
    // full page (100 of 2500) → Link:next header, set from the last hit by streamGeojson
    assert.ok(res.headers.link, 'a full geojson page sets a Link:next header')
  })

  test('backpressure/abort: a large streamed response completes without truncation or hang', async () => {
    // A full 2500-row streamed json body must arrive complete and parse cleanly (enveloped json: an
    // unterminated body would throw at JSON.parse). Client-abort → ES-stream destroy is wired via the
    // esAbortContext signal in search-stream.ts (verified by reasoning; not asserted here because a
    // deterministic mid-stream socket close against the live dev-api is flaky). This asserts the happy
    // path large-transfer completes, the concrete backpressure/no-loss guarantee.
    const res = await testUser1.get(`${base}?format=json&size=2500&sort=_id`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, N) // no truncation
    // strictly increasing _id ordering proves nothing was dropped/duplicated mid-stream
    for (let i = 0; i < res.data.results.length; i++) assert.equal(res.data.results[i]._id, pad(i))
  })

  test('count=false and a followed after= page: incremental source without hits.total in the ES response', async () => {
    // count=false → track_total_hits:false → the ES envelope has NO hits.total; the streamed source must
    // stay incremental and omit total from the body
    const p1 = await testUser1.get(`${base}?format=json&size=100&sort=_id&count=false`)
    assert.equal(p1.data.total, undefined)
    assert.equal(p1.data.results.length, 100)
    assert.ok(p1.data.next, 'count=false full page still carries a next link')
    assert.equal(p1.headers.link, `<${p1.data.next}>; rel=next`)

    // follow the next link — an `after=` page is ALSO track_total_hits:false server-side (the hot case:
    // every page ≥2 of the UI's large-download loop). The href is absolute (publicUrl-based), axios uses
    // it as-is, bypassing baseURL.
    const p2 = await testUser1.get(p1.data.next)
    assert.equal(p2.data.total, undefined)
    assert.equal(p2.data.results.length, 100)
    assert.equal(p2.data.results[0]._id, pad(100))
    assert.ok(p2.headers.link, 'the followed page carries its own Link:next header')
  })

  // §C: a streamed request whose ES `_search` ERRORS must surface as a clean HTTP error BEFORE any
  // partial body (never a 200 with a truncated/broken stream, never a hang). We delete the underlying ES
  // index so the streamed `asStream` request gets a non-200 from ES; search-stream.ts must translate that
  // into a proper HTTP error. Kept LAST because it destroys the dataset's index.
  test('live error path: streamed ES error surfaces as a clean HTTP error, not a broken body', async () => {
    // resolve the concrete index behind the dataset alias and delete it
    const esAlias = `${indicesPrefix}-${id}`
    const alias = (await testUser1.get(`http://${esHost}/${esAlias}`)).data
    const indexName = Object.keys(alias)[0]
    await testUser1.delete(`http://${esHost}/${indexName}`)

    await assert.rejects(
      testUser1.get(`${base}?format=json&size=2500&sort=_id`),
      (err: any) => {
        // a clean HTTP status (axios rejects only on non-2xx) — i.e. the error resolved BEFORE the first
        // byte. A 200-with-truncated-body would have RESOLVED here, failing assert.rejects.
        assert.ok(err.status >= 400 && err.status < 600, `expected 4xx/5xx, got ${err.status}`)
        assert.ok(String(err.data).includes('no such index') || err.status === 404, `expected an ES no-such-index error, got: ${JSON.stringify(err.data)}`)
        return true
      }
    )
  })
})
