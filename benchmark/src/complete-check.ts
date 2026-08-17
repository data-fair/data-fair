// Live probe of `q_mode=complete` ranking behavior against a real (API-seeded) dataset.
// Runs the data-fair /lines API and a raw-ES reproduction of buildQClauses' complete-mode
// body side by side: validates the reproduction (totals must match), prints the _score
// distribution of the top hits (the constant-ranking question), and _explain's account
// of where the score comes from.
// Usage: node --experimental-strip-types src/complete-check.ts [--dataset=bench-small] [--size=12]

import { parseArgs } from 'node:util'
import { init, getAxios } from './setup.ts'
import { getEsClient, resolveIndex } from './es.ts'

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'bench-small' },
    size: { type: 'string', default: '12' }
  }
})
const size = parseInt(values.size!)

const PROBES = ['comm', 'commune', 'ecol', 'commune tour']

/** Transcription of getFilterableFields for a raw mapping (new keyword_repeat shape). */
function deriveFields (mappingProps: Record<string, any>) {
  const qExactFields: string[] = []
  const qStandardFields: string[] = []
  const qSearchFields: string[] = []
  for (const [key, prop] of Object.entries(mappingProps)) {
    if (key.startsWith('_')) continue
    const fields = prop.fields ?? {}
    if (fields.text) { qExactFields.push(`${key}.text`); qSearchFields.push(`${key}.text`) }
    if (fields.text_standard) { qStandardFields.push(`${key}.text_standard`); qSearchFields.push(`${key}.text_standard`) }
    // pure-keyword string column: keyword main type, no analyzed inner fields
    if (prop.type === 'keyword' && !fields.text && !fields.text_standard) {
      qSearchFields.push(fields.keyword_insensitive ? `${key}.keyword_insensitive` : key)
    }
  }
  return { qExactFields, qStandardFields, qSearchFields }
}

/** buildQClauses, complete mode, new-shape dataset (no wildcard columns). */
function completeBody (q: string, f: ReturnType<typeof deriveFields>) {
  const should: any[] = []
  const prefixFields = [...f.qExactFields, ...f.qStandardFields]
  if (!q.includes('*') && !q.includes('?')) {
    should.push({ simple_query_string: { query: `${q}*`, fields: prefixFields } })
  }
  if (q.includes(' ') && !q.includes('"')) {
    should.push({ simple_query_string: { query: `"${q}"`, fields: f.qSearchFields } })
  }
  should.push({ simple_query_string: { query: q, fields: f.qSearchFields } })
  return {
    query: { bool: { should, minimum_should_match: 1 } },
    size,
    track_total_hits: true,
    sort: ['_score', { _updatedAt: 'desc' as const }, { _i: 'desc' as const }]
  }
}

function scoreSummary (scores: number[]): string {
  const distinct = [...new Set(scores.map(s => s.toFixed(4)))]
  return `${scores.length} hits, ${distinct.length} distinct score(s): [${distinct.slice(0, 6).join(', ')}${distinct.length > 6 ? ', …' : ''}]`
}

async function main () {
  await init()
  const ax = getAxios()
  const es = getEsClient()
  const index = await resolveIndex(values.dataset!)
  const mapping: any = await es.indices.getMapping({ index })
  const props = Object.values(mapping as Record<string, any>)[0].mappings.properties
  const fields = deriveFields(props)
  console.log(`\nindex=${index}`)
  console.log(`prefixFields=${[...fields.qExactFields, ...fields.qStandardFields].join(',')}`)
  console.log(`qSearchFields=${fields.qSearchFields.join(',')}`)

  for (const q of PROBES) {
    console.log(`\n=== q="${q}" ===`)
    for (const qMode of ['complete', 'simple']) {
      const api: any = (await ax.get(`/api/v1/datasets/${values.dataset}/lines`, { params: { q, q_mode: qMode, size } })).data
      const scores = api.results.map((r: any) => r._score)
      console.log(`  API  ${qMode.padEnd(8)} total=${String(api.total).padEnd(4)} ${scoreSummary(scores)}`)
    }
    const body = completeBody(q, fields)
    const esRes: any = await es.search({ index, ...body })
    const esScores = esRes.hits.hits.map((h: any) => h._score)
    console.log(`  ES   repro    total=${String(esRes.hits.total.value).padEnd(4)} ${scoreSummary(esScores)}`)

    // _explain the top hit of the raw-ES reproduction
    const top = esRes.hits.hits[0]
    if (top) {
      const explain: any = await es.explain({ index: top._index, id: top._id, query: body.query })
      const flat: string[] = []
      const walk = (node: any, depth: number) => {
        if (depth > 2 || !node) return
        flat.push(`${'  '.repeat(depth)}${node.value?.toFixed?.(4)} ${node.description?.slice(0, 110)}`)
        for (const d of node.details ?? []) walk(d, depth + 1)
      }
      walk(explain.explanation, 0)
      console.log('  explain(top hit):\n    ' + flat.join('\n    '))
    }
  }
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1) })
