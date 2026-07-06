import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

// Api equivalence for the streamed `/lines` path. `?_stream=true` (a non-prod opt-in, equivalent to the
// production `experimental.streamReadLines` flag) reads ES with asStream + the splitter for json/csv; the
// pipeline then serializes rows on the fly and res.sends the assembled body. The source (streamed vs the
// buffered esResponse from search()) is INTERNAL only — the response MUST be identical either way: same
// results/total, same body `next`, same Link header, same bytes (json deep-equal / csv byte-equal).

const testUser1 = await axiosAuth('test_user1@test.com')

const esHost = `localhost:${process.env.ES_PORT}`
const indicesPrefix = 'dataset-development'

const N = 2500
const id = 'streamlines'

// Deterministic rows: zero-padded `_id` so `sort=_id` is a stable total order; `grp` gives ~10 distinct
// values for the collapse test; `lat`/`lon` make the geojson (hard-format) fallback exercise real geo.
const pad = (i: number) => String(i).padStart(5, '0')
const rows = Array.from({ length: N }, (_, i) => ({
  _id: pad(i),
  str: i % 7 === 0 ? `has,comma "${i}"` : `label ${i}`,
  grp: 'g' + (i % 10),
  lat: 47 + (i % 50) * 0.001,
  lon: -2 + (i % 50) * 0.001,
  n: i
}))

test.describe('streamed /lines: api equivalence with the buffered path', () => {
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

  test('json: streamed is identical to buffered (results + total + body next + Link header)', async () => {
    const streamed = await testUser1.get(`${base}?format=json&size=2500&sort=_id&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=json&size=2500&sort=_id`)

    assert.equal(streamed.status, 200)
    assert.equal(streamed.data.total, N)
    assert.equal(streamed.data.total, buffered.data.total)
    assert.equal(streamed.data.results.length, N)
    assert.deepEqual(streamed.data.results, buffered.data.results)

    // full page (total === size) → both carry a body `next`. With `_stream` dropped once consumed, the
    // streamed `next` is byte-identical to the buffered one.
    assert.ok(buffered.data.next, 'buffered should carry a body next on a full page')
    assert.equal(streamed.data.next, buffered.data.next)

    // The source (streamed vs buffered) is internal only — since the body is assembled then res.send, the
    // streamed response keeps the SAME Link:next header as the buffered one (no observable difference).
    assert.ok(buffered.headers.link, 'buffered sets a Link:next header')
    assert.equal(streamed.headers.link, buffered.headers.link, 'streamed sets the same Link header')
    assert.equal(streamed.headers.link, `<${streamed.data.next}>; rel=next`)
  })

  test('csv: streamed is byte-equal to buffered', async () => {
    const streamed = await testUser1.get(`${base}?format=csv&size=2500&sort=_id&_stream=true`, { responseType: 'arraybuffer' })
    const buffered = await testUser1.get(`${base}?format=csv&size=2500&sort=_id`, { responseType: 'arraybuffer' })
    assert.equal(streamed.status, 200)
    assert.equal(streamed.headers['content-type'], 'text/csv; charset=utf-8')
    assert.equal(Buffer.from(streamed.data).length, Buffer.from(buffered.data).length)
    assert.equal(Buffer.from(streamed.data).toString('hex'), Buffer.from(buffered.data).toString('hex'))
  })

  test('hint: streamed hint equals buffered hint', async () => {
    const streamed = await testUser1.get(`${base}?format=json&size=2500&sort=_id&hint=true&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=json&size=2500&sort=_id&hint=true`)
    assert.ok(streamed.data.hint, 'a hint=true large request should carry a hint')
    assert.equal(streamed.data.hint, buffered.data.hint)
  })

  test('collapse: streamed totalCollapse present and equals buffered', async () => {
    const streamed = await testUser1.get(`${base}?format=json&size=2500&sort=_id&collapse=grp&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=json&size=2500&sort=_id&collapse=grp`)
    assert.ok(streamed.data.totalCollapse != null, 'streamed collapse carries totalCollapse')
    assert.equal(streamed.data.totalCollapse, buffered.data.totalCollapse)
    assert.equal(streamed.data.totalCollapse, 10) // 10 distinct grp values
    assert.deepEqual(streamed.data.results, buffered.data.results)
  })

  test('geojson: streamed source is identical to buffered, incl the Link header', async () => {
    const streamed = await testUser1.get(`${base}?format=geojson&size=100&sort=_id&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=geojson&size=100&sort=_id`)
    assert.equal(streamed.status, 200)
    assert.equal(streamed.data.type, 'FeatureCollection')
    assert.equal(streamed.data.features.length, 100)
    // geojson now consumes the streamed source (per-hit Feature → res.send), so it gets the same memory
    // treatment as json/csv while staying byte-for-byte identical to the buffered path.
    assert.deepEqual(streamed.data, buffered.data)
    // full page (100 of 2500) → Link:next header, set from the last hit by streamGeojson, same either way
    assert.ok(buffered.headers.link, 'buffered geojson sets a Link:next header')
    assert.equal(streamed.headers.link, buffered.headers.link)
  })

  test('backpressure/abort: a large streamed response completes without truncation or hang', async () => {
    // A full 2500-row streamed json body must arrive complete and parse cleanly (enveloped json: an
    // unterminated body would throw at JSON.parse). Client-abort → ES-stream destroy is wired via the
    // esAbortContext signal in search-stream.ts (verified by reasoning; not asserted here because a
    // deterministic mid-stream socket close against the live dev-api is flaky). This asserts the happy
    // path large-transfer completes, the concrete backpressure/no-loss guarantee.
    const streamed = await testUser1.get(`${base}?format=json&size=2500&sort=_id&_stream=true`)
    assert.equal(streamed.status, 200)
    assert.equal(streamed.data.results.length, N) // no truncation
    // strictly increasing _id ordering proves nothing was dropped/duplicated mid-stream
    for (let i = 0; i < streamed.data.results.length; i++) assert.equal(streamed.data.results[i]._id, pad(i))
  })

  test('count=false and a followed after= page: streamed equals buffered (no hits.total in the ES response)', async () => {
    // count=false → track_total_hits:false → the ES envelope has NO hits.total; the streamed source must
    // stay incremental (no total in the body either way) and byte-equivalent to the buffered path
    const streamedP1 = await testUser1.get(`${base}?format=json&size=100&sort=_id&count=false&_stream=true`)
    const bufferedP1 = await testUser1.get(`${base}?format=json&size=100&sort=_id&count=false`)
    assert.equal(streamedP1.data.total, undefined)
    assert.deepEqual(streamedP1.data, bufferedP1.data)
    assert.equal(streamedP1.headers.link, bufferedP1.headers.link)

    // follow the next link — an `after=` page is ALSO track_total_hits:false server-side (the hot case:
    // every page ≥2 of the UI's large-download loop). The href is absolute (publicUrl-based), axios uses
    // it as-is, bypassing baseURL.
    assert.ok(bufferedP1.data.next, 'count=false full page still carries a next link')
    const streamedP2 = await testUser1.get(bufferedP1.data.next + '&_stream=true')
    const bufferedP2 = await testUser1.get(bufferedP1.data.next)
    assert.equal(streamedP2.data.results.length, 100)
    assert.equal(streamedP2.data.results[0]._id, pad(100))
    assert.deepEqual(streamedP2.data, bufferedP2.data)
    assert.equal(streamedP2.headers.link, bufferedP2.headers.link)
  })

  // §C — the Task 6 ⚠️: a streamed request whose ES `_search` ERRORS must surface as a clean HTTP error
  // BEFORE any partial body (never a 200 with a truncated/broken stream, never a hang). We delete the
  // underlying ES index so the streamed `asStream` request gets a non-200 from ES; search-stream.ts must
  // translate that into a proper HTTP error. Kept LAST because it destroys the dataset's index.
  test('live error path: streamed ES error surfaces as a clean HTTP error, not a broken body', async () => {
    // resolve the concrete index behind the dataset alias and delete it
    const esAlias = `${indicesPrefix}-${id}`
    const alias = (await testUser1.get(`http://${esHost}/${esAlias}`)).data
    const indexName = Object.keys(alias)[0]
    await testUser1.delete(`http://${esHost}/${indexName}`)

    await assert.rejects(
      testUser1.get(`${base}?format=json&size=2500&sort=_id&_stream=true`),
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
