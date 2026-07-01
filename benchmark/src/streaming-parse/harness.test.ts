import assert from 'node:assert/strict'
import { measure } from './harness.ts'
const m = await measure(async () => { const a = []; for (let i = 0; i < 1000; i++) a.push({ i }); return a }, 2, 5)
assert.ok(m.msPerIter >= 0)
assert.ok(m.gcCount >= 0)
assert.ok(m.peakRssMb > 0)
console.log('harness.test OK', JSON.stringify(m))
