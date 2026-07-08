import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { BodyAccumulator, buildJsonBody } from '../../../api/src/datasets/routes/lines-body.ts'

// The accumulator replaces the single monolithic join + Express-internal sha1 + utf8-encode of /lines
// bodies with per-batch encoding and hashing inside the consume loop's yields. Its contract:
//   - the final buffer is BYTE-IDENTICAL to the string the old path sent;
//   - the ETag is an OPAQUE deterministic content fingerprint (weak format) — NOT Express's body hash.
//     Same body ⇒ same etag (across pods/restarts/batching), any body change (rows OR envelope,
//     e.g. a different `total` with identical rows) ⇒ different etag.
//   - finish() is synchronous: hashing happened at flush time, only the concat remains.
test.describe('BodyAccumulator (pure)', () => {
  const build = (rows: string[], prefix: string, suffix: string, flushChars?: number) => {
    const acc = new BodyAccumulator(flushChars ? { flushChars } : undefined)
    rows.forEach((row, i) => acc.push(i === 0 ? row : ',' + row))
    return acc.finish(prefix, suffix)
  }

  const rows = [JSON.stringify({ a: 'plain' }), JSON.stringify({ a: 'accented é 💥' })]

  test('bytes match the buildJsonBody string, finish is synchronous', () => {
    const head = { total: 2, next: 'http://x/lines?after=1' }
    const headStr = JSON.stringify(head)
    const result = build(rows, headStr.slice(0, -1) + ',"results":[', ']}')
    assert.ok(!(result instanceof Promise))
    assert.equal(result.buffer.toString(), buildJsonBody(head, rows))
  })

  test('etag: weak format with the exact body byte length in hex', () => {
    const { buffer, etag } = build(rows, '{"results":[', ']}')
    const match = etag.match(/^W\/"([0-9a-f]+)-[A-Za-z0-9+/]{27}"$/)
    assert.ok(match, `unexpected etag format: ${etag}`)
    assert.equal(parseInt(match![1], 16), buffer.length)
  })

  test('etag is deterministic and insensitive to flush batching', () => {
    const reference = build(rows, '{"results":[', ']}')
    assert.equal(build(rows, '{"results":[', ']}').etag, reference.etag)
    // a tiny flush threshold changes the internal Buffer boundaries, never the etag or the bytes
    const tiny = build(rows, '{"results":[', ']}', 4)
    assert.equal(tiny.etag, reference.etag)
    assert.equal(tiny.buffer.toString(), reference.buffer.toString())
  })

  test('etag changes when any part of the body changes, envelope included', () => {
    const reference = build(rows, '{"results":[', ']}').etag
    // different rows
    assert.notEqual(build([rows[0]], '{"results":[', ']}').etag, reference)
    // identical rows, different envelope head (e.g. total changed while the page did not)
    assert.notEqual(build(rows, '{"total":3,"results":[', ']}').etag, reference)
    // identical rows, different suffix
    assert.notEqual(build(rows, '{"results":[', ']},').etag, reference)
  })

  test('empty body (no pushes) still yields the exact envelope and a valid etag', () => {
    const { buffer, etag } = build([], '{"results":[', ']}')
    assert.equal(buffer.toString(), '{"results":[]}')
    assert.match(etag, /^W\/"e-[A-Za-z0-9+/]{27}"$/) // 14 bytes = 0xe
  })
})
