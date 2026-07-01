import assert from 'node:assert/strict'
import { makeBuffers } from './buffers.ts'
const bufs = makeBuffers(50)
assert.equal(bufs.length, 4)
for (const { name, buf, descriptor } of bufs) {
  const parsed = JSON.parse(buf.toString())
  assert.equal(parsed.hits.hits.length, 50, name)
  assert.ok(descriptor.columns.length > 0, name)
}
console.log('buffers.test OK')
