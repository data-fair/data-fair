import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { transferableRawBuffer, slimDatasetForFlatten } from '../../../api/src/datasets/utils/worker-transfer.ts'

test.describe('worker-transfer (pure, config-free)', () => {
  test('buffer owning an exclusive, offset-0, exact-size ArrayBuffer: transferred without copying', () => {
    // Wrap a freshly allocated ArrayBuffer so the Buffer exclusively owns it at offset 0 with an
    // exact-size backing store — deterministically, independent of the ambient Buffer.poolSize.
    // (Don't rely on Buffer.concat staying unpooled: that only holds while poolSize/2 < 16KB, and
    // a raised poolSize elsewhere in the suite would pool the concat and push it onto the copy path.)
    const raw = Buffer.from(new ArrayBuffer(16 * 1024))
    raw.fill(1)
    const { payload, transferList } = transferableRawBuffer(raw)
    assert.equal(payload, raw) // same view, no copy
    assert.equal(transferList[0], raw.buffer) // the buffer's own ArrayBuffer is what gets transferred
  })

  test('small pooled buffer: falls back to a copy into a standalone ArrayBuffer', () => {
    const raw = Buffer.from('0123456789') // pooled: byteOffset != 0 or oversized backing store
    const { payload, transferList } = transferableRawBuffer(raw)
    assert.notEqual(transferList[0], raw.buffer) // must NOT transfer the shared pool
    assert.equal(payload.byteLength, raw.length)
    assert.equal(Buffer.from(payload).toString(), '0123456789')
  })

  test('slimDatasetForFlatten keeps only what compileFlatten reads', () => {
    const dataset = { id: 'ds', finalizedAt: 'now', title: 'x', schema: [{ key: 'a', separator: ';', type: 'string', 'x-junk': () => {} }] }
    assert.deepEqual(slimDatasetForFlatten(dataset), { id: 'ds', finalizedAt: 'now', schema: [{ key: 'a', separator: ';' }] })
  })
})
