// Load the RNA open-data dataset (repertoire-national-des-associations,
// opendata.koumoul.com, ~3.3M rows) into local ES 8 AND ES 7 test indices with a
// faithful data-fair mapping: keyword mains + .text (french) / .text_standard
// sub-fields, `_search` catch-all via copy_to, `_i` line number and a shared
// `_rand` per row (same sampling slice on both versions).
// Usage: node --experimental-strip-types src/rna-load.ts [--es8=http://localhost:26885] [--es7=http://localhost:29200] [--max=3300000]

import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    es8: { type: 'string', default: 'http://localhost:26885' },
    es7: { type: 'string', default: 'http://localhost:29200' },
    source: { type: 'string', default: 'https://opendata.koumoul.com/data-fair/api/v1/datasets/repertoire-national-des-associations' },
    analysisFrom: { type: 'string', default: 'dataset-benchmark-bench-tall-2ce7d84c529f-1779458726525' },
    index: { type: 'string', default: 'bench-rna' },
    max: { type: 'string', default: '3300000' }
  }
})
const max = parseInt(values.max!)
const FIELDS = ['titre', 'objet', 'adresse_siege', 'nom_commune_siege']

async function es (base: string, method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  })
  const data: any = await res.json()
  if (!res.ok) throw new Error(`${method} ${base}${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data
}

// data-fair-style property mapping: keyword main + analyzed sub-fields + copy_to _search
const textProp = {
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' }
  },
  copy_to: '_search'
}
const mappings = {
  dynamic: false,
  properties: {
    _i: { type: 'long' },
    _rand: { type: 'integer' },
    _search: {
      type: 'text',
      analyzer: 'custom_french',
      fields: { text_standard: { type: 'text', analyzer: 'standard' } }
    },
    ...Object.fromEntries(FIELDS.map(f => [f, textProp]))
  }
}

// custom_french analyzer definition comes from the existing bench index (data-fair images
// on both versions carry the same analysis plugins)
const got = await es(values.es8!, 'GET', `/${values.analysisFrom}`)
const analysis = (Object.values(got)[0] as any).settings.index.analysis
// pass --es7=skip (or --es8=skip) to load a single cluster
const targets = [
  { name: 'es8', base: values.es8! },
  { name: 'es7', base: values.es7! }
].filter(t => t.base !== 'skip')
for (const t of targets) {
  await es(t.base, 'DELETE', `/${values.index}`).catch(() => {})
  await es(t.base, 'PUT', `/${values.index}`, {
    settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '30s', analysis },
    mappings
  })
  console.log(`[rna-load] created ${values.index} on ${t.name}`)
}

let url = `${values.source}/lines?size=10000&select=${FIELDS.join(',')}&sort=_i`
let i = 0
const t0 = performance.now()
while (url && i < max) {
  let page: any
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'data-fair-benchmark (ES perf validation; contact: koumoul dev team)' } })
      if (res.status === 429) throw new Error('429')
      if (!res.ok) throw new Error(`${res.status}`)
      page = await res.json()
      break
    } catch (err: any) {
      if (attempt >= 5) throw err
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
    }
  }
  const lines: string[] = []
  for (const row of page.results) {
    const doc: any = { _i: i, _rand: Math.floor(Math.random() * 1_000_000) }
    for (const f of FIELDS) if (row[f] !== undefined && row[f] !== null) doc[f] = String(row[f]).slice(0, 1000)
    lines.push(JSON.stringify({ index: { _id: String(i) } }))
    lines.push(JSON.stringify(doc))
    i++
  }
  const bulkBody = lines.join('\n') + '\n'
  const bulkResults = await Promise.all(targets.map(t => es(t.base, 'POST', `/${values.index}/_bulk`, bulkBody)))
  for (const [ti, br] of bulkResults.entries()) {
    if (br.errors) {
      const firstErr = br.items.find((it: any) => it.index?.error)
      throw new Error(`bulk errors on ${targets[ti].name}: ${JSON.stringify(firstErr).slice(0, 300)}`)
    }
  }
  if (i % 100000 === 0) console.log(`[rna-load] ${i} rows (${Math.round(i / ((performance.now() - t0) / 1000))}/s)`)
  url = page.next
}

for (const t of targets) {
  await es(t.base, 'PUT', `/${values.index}/_settings`, { index: { refresh_interval: '1s' } })
  await es(t.base, 'POST', `/${values.index}/_refresh`)
  await es(t.base, 'POST', `/${values.index}/_forcemerge?max_num_segments=5`).catch((err: any) => console.log(`[rna-load] forcemerge ${t.name}:`, err.message))
  const count = await es(t.base, 'GET', `/${values.index}/_count`)
  console.log(`[rna-load] ${t.name}: ${count.count} docs`)
}
console.log(`[rna-load] done, ${i} rows in ${Math.round((performance.now() - t0) / 1000)}s`)
