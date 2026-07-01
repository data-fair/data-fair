import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { v8 } from './v8.ts'
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const json = JSON.parse((await v8.t2json(buf, descriptor)).toString())
assert.equal(json.length, 20)
assert.equal(json[0]['a.b'], 'deep-0')            // flatten
assert.equal(json[0].tags, 't0;t0;t0')            // multivalue join (i=0)
const csv = (await v8.t2csv(buf, descriptor)).toString()
assert.ok(csv.startsWith('"a.b","a.c","tags","label"\n'))
console.log('v8.test OK')
