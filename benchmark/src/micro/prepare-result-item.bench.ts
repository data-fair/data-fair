// Micro-benchmark: prepareResultItem legacy path vs prepareResultContext fast path,
// in isolation (no server, no ES). Proves/disproves the T1 claim from perf-scan-notes.md.
//
// Run from the repo root (config needs the api config dir and .env):
//   NODE_CONFIG_DIR=api/config NODE_ENV=benchmark node --experimental-strip-types \
//     --disable-warning=ExperimentalWarning benchmark/src/micro/prepare-result-item.bench.ts

import { prepareResultItem, prepareResultContext } from '../../../api/src/datasets/es/commons.js'

const identityFlatten = (obj: any) => ({ ...obj })

function makeDataset (fieldCount: number) {
  const schema = Array.from({ length: fieldCount }, (_, i) => ({
    key: i === 0 ? '_id' : `field${i}`,
    type: i % 3 === 2 ? 'number' : 'string'
  }))
  return { id: 'micro-bench', schema, attachmentsAsImage: false }
}

function makeHits (count: number, fieldCount: number) {
  const hits = []
  for (let i = 0; i < count; i++) {
    const _source: Record<string, any> = {}
    for (let f = 1; f < fieldCount; f++) _source[`field${f}`] = f % 3 === 2 ? i : `value-${i}-${f}`
    hits.push({ _id: `id-${i}`, _score: null, _source })
  }
  return hits
}

function bench (label: string, fn: () => void, runs = 5) {
  fn() // warmup (JIT)
  const times = []
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  const best = Math.min(...times)
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
  console.log(`${label.padEnd(46)} median ${median.toFixed(1)}ms  best ${best.toFixed(1)}ms`)
  return median
}

const HITS = 10000

for (const [datasetLabel, fieldCount, query] of [
  ['50 fields, no params', 50, {}],
  ['50 fields, truncate=50', 50, { truncate: '50' }],
  ['300 fields, no params', 300, {}],
  ['300 fields, truncate=50', 300, { truncate: '50' }]
] as const) {
  const dataset = makeDataset(fieldCount)
  const hits = makeHits(HITS, fieldCount)
  console.log(`\n--- ${datasetLabel} (${HITS} hits) ---`)
  const legacy = bench('legacy path (no ctx)', () => {
    for (const hit of hits) prepareResultItem(hit, dataset, query, identityFlatten, 'http://localhost')
  })
  const fast = bench('fast path (prepareResultContext)', () => {
    const ctx = prepareResultContext(dataset, query)
    for (const hit of hits) prepareResultItem(hit, dataset, query, identityFlatten, 'http://localhost', ctx)
  })
  console.log(`speedup ×${(legacy / fast).toFixed(1)}`)
}
