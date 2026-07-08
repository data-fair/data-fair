import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import etag from 'etag'
import { BodyAccumulator, buildJsonBody } from '../../../api/src/datasets/routes/lines-body.ts'

// The accumulator replaces the single monolithic join + Express-internal sha1 + utf8-encode of /lines
// bodies with per-batch encoding and a yielded hash pass. Its contract: the final buffer is BYTE-IDENTICAL
// to the string the old path sent, and the self-computed ETag is byte-identical to what Express would have
// generated (weak etag of the body). The `etag` npm package (what Express uses) is the oracle.
test.describe('BodyAccumulator (pure)', () => {
  const expectEqualToString = async (acc: BodyAccumulator, prefix: string, suffix: string, expected: string) => {
    const { buffer, etag: tag } = await acc.finish(prefix, suffix)
    assert.equal(buffer.toString(), expected)
    assert.equal(tag, etag(expected, { weak: true }))
  }

  test('bytes and etag match the buildJsonBody string and the etag package', async () => {
    const head = { total: 2, next: 'http://x/lines?after=1' }
    const rows = [JSON.stringify({ a: 'plain' }), JSON.stringify({ a: 'accented é 💥' })]
    const acc = new BodyAccumulator()
    rows.forEach((row, i) => acc.push(i === 0 ? row : ',' + row))
    const headStr = JSON.stringify(head)
    await expectEqualToString(acc, headStr.slice(0, -1) + ',"results":[', ']}', buildJsonBody(head, rows))
  })

  test('internal flushing at a tiny threshold does not change bytes or etag', async () => {
    const acc = new BodyAccumulator({ flushChars: 4 })
    const rows: string[] = []
    for (let i = 0; i < 100; i++) {
      const row = JSON.stringify({ i, s: 'é💥'.repeat(i % 7) })
      rows.push(row)
      acc.push(i === 0 ? row : ',' + row)
    }
    await expectEqualToString(acc, '{"results":[', ']}', buildJsonBody({}, rows))
  })

  test('empty body (no pushes) still yields the exact envelope and etag', async () => {
    await expectEqualToString(new BodyAccumulator(), '{"results":[', ']}', '{"results":[]}')
  })

  test('hash pass yields between slices without altering the result', async () => {
    // hashYieldBytes far below the body size forces many yield points in finish()
    const acc = new BodyAccumulator({ flushChars: 32, hashYieldBytes: 64 })
    const rows: string[] = []
    for (let i = 0; i < 500; i++) {
      const row = JSON.stringify({ i, pad: 'x'.repeat(20) })
      rows.push(row)
      acc.push(i === 0 ? row : ',' + row)
    }
    await expectEqualToString(acc, '{"results":[', ']}', buildJsonBody({}, rows))
  })
})
