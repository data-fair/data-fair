import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from './v8.ts'
import { simdjson } from './simdjson.ts'
if (!simdjson.available) { console.log('simdjson.test SKIP (unavailable)'); process.exit(0) }
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const ref = await referenceOutput(buf, descriptor)
assert.deepEqual(JSON.parse((await simdjson.t2json(buf, descriptor)).toString()), JSON.parse(ref.json.toString()))
assert.ok((await simdjson.t2csv(buf, descriptor)).equals(ref.csv))
console.log('simdjson.test OK')
