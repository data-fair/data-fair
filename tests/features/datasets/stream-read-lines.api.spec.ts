import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

// Api equivalence for the streamed `/lines` path. The streamed source is gated by `?_stream=true` (a
// non-prod opt-in that FORCES streaming, bypassing the content-length threshold) AND json/csv format — so
// these 2500-row requests deterministically exercise the streamed path regardless of their byte size. Under
// the production flag the same request would only stream once its ES response reaches streamReadLinesMinBytes
// (500KB). The streamed output MUST be deep-equal (json) / byte-equal (csv) to the default buffered path.

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

  test('json: streamed deep-equals buffered (results + total + body next), Link header only on buffered', async () => {
    const streamed = await testUser1.get(`${base}?format=json&size=2500&sort=_id&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=json&size=2500&sort=_id`)

    assert.equal(streamed.status, 200)
    assert.equal(streamed.data.total, N)
    assert.equal(streamed.data.total, buffered.data.total)
    assert.equal(streamed.data.results.length, N)
    assert.deepEqual(streamed.data.results, buffered.data.results)

    // full page (total === size) → both carry a body `next`. With `_stream` dropped once consumed, the
    // streamed `next` is byte-identical to the buffered one (design §6 / read.ts parity fix).
    assert.ok(buffered.data.next, 'buffered should carry a body next on a full page')
    assert.equal(streamed.data.next, buffered.data.next)

    // The streamed path cannot set the Link header (last-hit sort unknown at header-flush time); the
    // buffered path does. This asymmetry is the documented streamed-mode limitation.
    assert.ok(buffered.headers.link, 'buffered sets a Link:next header')
    assert.ok(!streamed.headers.link, 'streamed omits the Link header (documented)')
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

  test('hard format geojson with _stream=true falls back to buffered and stays correct', async () => {
    const streamed = await testUser1.get(`${base}?format=geojson&size=100&sort=_id&_stream=true`)
    const buffered = await testUser1.get(`${base}?format=geojson&size=100&sort=_id`)
    assert.equal(streamed.status, 200)
    assert.equal(streamed.data.type, 'FeatureCollection')
    assert.equal(streamed.data.features.length, 100)
    // geojson is ineligible for streaming → both go buffered → identical output.
    assert.deepEqual(streamed.data, buffered.data)
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
