import { makeBuffers } from './buffers.ts'
import { measure, printTable, type Measurement } from './harness.ts'
import { referenceOutput, v8 } from './substrates/v8.ts'
import { streamparser } from './substrates/streamparser.ts'
import { jsonparse } from './substrates/jsonparse.ts'
import { streamjson } from './substrates/streamjson.ts'
import { simdjson } from './substrates/simdjson.ts'
import assert from 'node:assert/strict'

const substrates = [v8, streamparser, jsonparse, streamjson, simdjson].filter(s => s.available)
const buffers = makeBuffers(Number(process.env.ROWS || 10000))
const table: Array<{ substrate: string, task: string } & Measurement> = []

for (const nb of buffers) {
  console.log(`\n=== buffer: ${nb.name} (${nb.descriptor.columns.length} cols) ===`)
  const ref = await referenceOutput(nb.buf, nb.descriptor)
  for (const s of substrates) {
    // correctness gate (skip v8 vs itself)
    if (s.name !== 'v8') {
      try {
        assert.deepEqual(JSON.parse((await s.t2json(nb.buf, nb.descriptor)).toString()), JSON.parse(ref.json.toString()))
        assert.ok((await s.t2csv(nb.buf, nb.descriptor)).equals(ref.csv))
      } catch (e) { console.log(`  ${s.name}: DISQUALIFIED (output mismatch on ${nb.name}) — ${e}`); continue }
    }
    table.push({ substrate: s.name, task: `${nb.name}/T1`, ...(await measure(() => s.t1(nb.buf, nb.descriptor))) })
    table.push({ substrate: s.name, task: `${nb.name}/json`, ...(await measure(() => s.t2json(nb.buf, nb.descriptor))) })
    table.push({ substrate: s.name, task: `${nb.name}/csv`, ...(await measure(() => s.t2csv(nb.buf, nb.descriptor))) })
  }
}
printTable(table)
