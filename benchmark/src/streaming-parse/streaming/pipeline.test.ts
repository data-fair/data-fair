import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutputSync as referenceOutput } from '../substrates/v8.ts'
import { chunked, streaming, collectSink } from './pipeline.ts'

const noop = () => {}
for (const nb of makeBuffers(50)) {
  const ref = referenceOutput(nb.buf, nb.descriptor)
  for (const K of [1, 7, 100, Infinity]) {
    const js = collectSink(); streaming(chunked(nb.buf, 17), nb.descriptor, 'json', K, js.sink, noop)
    assert.deepEqual(JSON.parse(js.get().toString()), JSON.parse(ref.json.toString()), `${nb.name} json K=${K}`)
    const csv = collectSink(); streaming(chunked(nb.buf, 17), nb.descriptor, 'csv', K, csv.sink, noop)
    assert.ok(csv.get().equals(ref.csv), `${nb.name} csv K=${K}`)
  }
}
console.log('pipeline.test OK')
