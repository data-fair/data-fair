// Validation of the count-split strategy on an arbitrary ES node over plain HTTP
// (works against ES 7.x, which the harness's v8 client refuses). Runs the same
// variant bodies as experiments/count-split.ts against one node and prints a
// comparable table. Usage:
//   node --experimental-strip-types src/es7-check.ts --node=http://localhost:29200 --index=dataset-benchmark-bench-tall [--runs=20] [--cold] [--label=es7]

import { parseArgs } from 'node:util'
import { aggregate } from './metrics.ts'

const { values } = parseArgs({
  options: {
    node: { type: 'string', default: 'http://localhost:29200' },
    index: { type: 'string', default: 'dataset-benchmark-bench-tall' },
    runs: { type: 'string', default: '20' },
    warmup: { type: 'string', default: '3' },
    cold: { type: 'boolean', default: false },
    label: { type: 'string', default: '' }
  }
})
const runs = parseInt(values.runs!)
const warmup = parseInt(values.warmup!)

async function es (method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(values.node! + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data: any = await res.json()
  if (!res.ok) {
    const err: any = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data.error?.root_cause?.[0] ?? data).slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return data
}

// Same shapes as experiments/count-split.ts, on the tall preset's text1.text field.
const TERMS = 'analyse population transport'
const disjunction = { simple_query_string: { query: TERMS, fields: ['text1.text'], default_operator: 'or' } }
const commonTerm = { match: { 'text1.text': 'population' } }

const variants = (query: any) => [
  { name: 'scored-exact', body: { query, size: 20, track_total_hits: true } },
  { name: 'wand-hits', body: { query, size: 20, track_total_hits: false } },
  { name: 'capped-hits', body: { query, size: 20, track_total_hits: 10_000 } },
  { name: 'filter-count', body: { query: { bool: { filter: [query] } }, size: 0, track_total_hits: true } },
  {
    name: 'sampler-1pct', // EXPECTED to fail on ES < 8.2 — that failure is part of the validation
    body: {
      query: { bool: { filter: [query] } },
      size: 0,
      track_total_hits: false,
      aggs: { sample: { random_sampler: { probability: 0.01, seed: 42 }, aggs: { noop: { max: { field: '_i' } } } } }
    },
    probability: 0.01
  },
  {
    name: 'rand-count-1pct',
    body: { query: { bool: { filter: [query, { range: { _rand: { lt: 10_000 } } }] } }, size: 0, track_total_hits: true },
    probability: 0.01
  }
]

const info = await es('GET', '/')
console.log(`\nES ${info.version.number} @ ${values.node} — index ${values.index}, runs=${runs}, ${values.cold ? 'cold' : 'warm'} ${values.label}`)

for (const [expName, query] of [['disjunction', disjunction], ['common-term', commonTerm]] as const) {
  console.log(`\n[${expName}]`)
  console.log('variant'.padEnd(17) + '| took p50 | took min | total')
  for (const v of variants(query)) {
    try {
      for (let w = 0; w < warmup; w++) await es('POST', `/${values.index}/_search`, v.body)
      const tooks: number[] = []
      let last: any
      for (let r = 0; r < runs; r++) {
        if (values.cold) await es('POST', `/${values.index}/_cache/clear`)
        last = await es('POST', `/${values.index}/_search`, v.body)
        tooks.push(last.took)
      }
      const agg = aggregate(tooks)
      const sampled = last.aggregations?.sample?.doc_count ?? last.hits.total?.value
      const total = v.probability
        ? `${Math.round(sampled / v.probability).toLocaleString()} (estimate)`
        : `${(last.hits.total?.value ?? 0).toLocaleString()} (${last.hits.total?.relation ?? '-'})`
      console.log(v.name.padEnd(17) + `| ${String(agg.median).padStart(8)} | ${String(agg.min).padStart(8)} | ${total}`)
    } catch (err: any) {
      console.log(v.name.padEnd(17) + `| FAILED: ${err.message.slice(0, 110)}`)
    }
  }
}
