// One-shot: copy the seeded bench-tall index from the dev ES 8 into a throwaway ES 7
// container so count-split can be validated on the production ES major (7.17).
// Plain fetch on both sides — the @elastic/elasticsearch v8 client refuses 7.x servers.
// Usage: node --experimental-strip-types src/es7-copy.ts --source=http://localhost:26885 --target=http://localhost:29200 --index=<es8 index>

import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: 'http://localhost:26885' },
    target: { type: 'string', default: 'http://localhost:29200' },
    index: { type: 'string' },
    alias: { type: 'string', default: 'dataset-benchmark-bench-tall' },
    batch: { type: 'string', default: '5000' }
  }
})
if (!values.index) throw new Error('--index=<es8 index name> is required')
const batch = parseInt(values.batch!)

async function es (base: string, method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  })
  const data: any = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 500)}`)
  return data
}

// 1. Recreate the index on ES 7: same analysis settings + mappings, minus the
// ES-managed/self-referential settings that a create call must not carry.
const got = await es(values.source!, 'GET', `/${values.index}`)
const def = Object.values(got)[0] as any
const analysis = def.settings.index.analysis
await es(values.target!, 'DELETE', `/${values.alias}-es7`).catch(() => {})
await es(values.target!, 'PUT', `/${values.alias}-es7`, {
  settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '30s', analysis },
  mappings: def.mappings,
  aliases: { [values.alias!]: {} }
})
console.log(`[es7-copy] created ${values.alias}-es7 (alias ${values.alias})`)

// 2. Scroll ES 8 → bulk ES 7, preserving _id.
let scroll = await es(values.source!, 'POST', `/${values.index}/_search?scroll=5m`, {
  size: batch, sort: ['_doc'], _source: true
})
let copied = 0
const t0 = performance.now()
while (scroll.hits.hits.length > 0) {
  const lines: string[] = []
  for (const hit of scroll.hits.hits) {
    lines.push(JSON.stringify({ index: { _id: hit._id } }))
    lines.push(JSON.stringify(hit._source))
  }
  const bulkRes = await es(values.target!, 'POST', `/${values.alias}-es7/_bulk`, lines.join('\n') + '\n')
  if (bulkRes.errors) {
    const firstErr = bulkRes.items.find((i: any) => i.index?.error)
    throw new Error(`bulk errors, first: ${JSON.stringify(firstErr).slice(0, 500)}`)
  }
  copied += scroll.hits.hits.length
  if (copied % (batch * 20) === 0) console.log(`[es7-copy] ${copied} docs (${Math.round(copied / ((performance.now() - t0) / 1000))}/s)`)
  scroll = await es(values.source!, 'POST', '/_search/scroll', { scroll: '5m', scroll_id: scroll._scroll_id })
}
await es(values.target!, 'PUT', `/${values.alias}-es7/_settings`, { index: { refresh_interval: '1s' } })
await es(values.target!, 'POST', `/${values.alias}-es7/_refresh`)
await es(values.target!, 'POST', `/${values.alias}-es7/_forcemerge?max_num_segments=5`).catch((err: any) => console.log('[es7-copy] forcemerge skipped:', err.message))
const count = await es(values.target!, 'GET', `/${values.alias}-es7/_count`)
console.log(`[es7-copy] done: ${copied} docs copied, target counts ${count.count}`)
