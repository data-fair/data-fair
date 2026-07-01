import { makeBuffers } from './buffers.ts'
import { measure, printTable, type Measurement } from './harness.ts'
import { referenceOutput, v8 } from './substrates/v8.ts'
import { streamparser } from './substrates/streamparser.ts'
import { jsonparse } from './substrates/jsonparse.ts'
import { streamjson } from './substrates/streamjson.ts'
import { simdjson, simdjsonLazyT1 } from './substrates/simdjson.ts'
import assert from 'node:assert/strict'

const substrates = [v8, streamparser, jsonparse, streamjson, simdjson].filter(s => s.available)
// ROWS=2000: allocation scales linearly, so 2000 compares substrates fine; 10k not
// needed for a comparative bytes/iter metric and makes stream-json/wide intolerable.
const buffers = makeBuffers(Number(process.env.ROWS || 2000))
const table: Array<{ substrate: string, task: string } & Measurement> = []

for (const nb of buffers) {
  console.log(`\n=== buffer: ${nb.name} (${nb.descriptor.columns.length} cols) ===`)
  const ref = await referenceOutput(nb.buf, nb.descriptor)
  for (const s of substrates) {
    // stream-json is O(buffer-size): on the 300-col wide buffer it is ~7 s/iter at
    // ROWS=2000 and would dominate runtime. Skip that one cell with a printed note.
    if (s.name === 'stream-json' && nb.name === 'wide') {
      console.log('  stream-json/wide: SKIPPED (O(buffer) too slow)')
      continue
    }
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

// --- simdjson lazy characterisation (NOT in the main table) ---------------------
// Quantify the per-field boundary cost of the ORIGINAL lazy per-(row,column) pull,
// which is O(N²×cols) in this binding. Measured on ONE small buffer at 300 rows to
// keep it from dominating runtime. This is why the "lazy pull off the tape" vision is
// impractical with the simdjson node binding.
if (simdjson.available) {
  const small = makeBuffers(300).find(b => b.name === 'string-heavy')!
  const lazy = await measure(() => Promise.resolve(simdjsonLazyT1(small.buf, small.descriptor)), 2, 5, 3)
  const mat = await measure(() => simdjson.t1(small.buf, small.descriptor), 2, 5, 3)
  console.log('\n--- simdjson lazy vs materialise characterisation (string-heavy @ 300 rows, T1) ---')
  console.log(`simdjson-lazy@300   (O(N²) per-field pull): ${lazy.msPerIter.toFixed(2)} ms/iter`)
  console.log(`simdjson-mat @300   (parse->JS objects)    : ${mat.msPerIter.toFixed(2)} ms/iter`)
  console.log(`slowdown factor: ${(lazy.msPerIter / mat.msPerIter).toFixed(1)}×`)
}
