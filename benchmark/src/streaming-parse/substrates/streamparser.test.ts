import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from './v8.ts'
import { streamparser } from './streamparser.ts'
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const ref = await referenceOutput(buf, descriptor)
assert.deepEqual(JSON.parse((await streamparser.t2json(buf, descriptor)).toString()), JSON.parse(ref.json.toString()))
assert.ok((await streamparser.t2csv(buf, descriptor)).equals(ref.csv))
console.log('streamparser.test OK')
