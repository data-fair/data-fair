import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { transferableRawBuffer, slimDatasetForFlatten } from '../../../api/src/datasets/utils/worker-transfer.ts'

test.describe('worker-transfer (pure, config-free)', () => {
  test('large unpooled buffer: transferred without copying', () => {
    // Buffer.concat > Buffer.poolSize/2 (4KB) allocates an exclusive, offset-0, exact-size ArrayBuffer
    const raw = Buffer.concat([Buffer.alloc(8 * 1024, 1), Buffer.alloc(8 * 1024, 2)])
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
