// Real-corpus (RNA, 3.3M French associations) evaluation of:
//  A. the track_total_hits cap on natural Zipfian text (the ES 7.17 WAND question)
//  B. minimum_should_match flavours as a load knob: hard AND, msm=2, client-side
//     rare-terms-must (old common_terms semantics), and an adaptive strict→relaxed cascade.
// Prod-faithful surface: simple_query_string over [_search, _search.text_standard], size 20.
// Usage: node --experimental-strip-types src/rna-check.ts --node=http://localhost:29200 [--index=bench-rna] [--runs=10] [--cold]

import { parseArgs } from 'node:util'
import { aggregate } from './metrics.ts'

const { values } = parseArgs({
  options: {
    node: { type: 'string', default: 'http://localhost:29200' },
    index: { type: 'string', default: 'bench-rna' },
    runs: { type: 'string', default: '10' },
    warmup: { type: 'string', default: '2' },
    cold: { type: 'boolean', default: false }
  }
})
const runs = parseInt(values.runs!)
const warmup = parseInt(values.warmup!)
const FIELDS = ['_search', '_search.text_standard']

async function es (method: string, path: string, body?: any, ndjson?: string): Promise<any> {
  const res = await fetch(values.node! + path, {
    method,
    headers: { 'Content-Type': ndjson !== undefined ? 'application/x-ndjson' : 'application/json' },
    body: ndjson !== undefined ? ndjson : (body === undefined ? undefined : JSON.stringify(body))
  })
  const data: any = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data.error?.root_cause?.[0] ?? data).slice(0, 200)}`)
  return data
}

const QUERIES = [
  'rue baudelaire',
  'association sportive',
  'club de football marseille',
  'comité des fêtes saint pierre',
  'association'
]

const sqs = (q: string, opts: any = {}) => ({
  simple_query_string: { query: q, fields: FIELDS, default_operator: 'or', ...opts }
})

interface Measured { tookP50: number, tookMin: number, total: string, top: string[], note?: string }

async function measure (body: any, note?: string): Promise<Measured> {
  for (let w = 0; w < warmup; w++) await es('POST', `/${values.index}/_search`, body)
  const tooks: number[] = []
  let last: any
  for (let r = 0; r < runs; r++) {
    if (values.cold) await es('POST', `/${values.index}/_cache/clear`)
    last = await es('POST', `/${values.index}/_search`, body)
    tooks.push(last.took)
  }
  const agg = aggregate(tooks)
  return {
    tookP50: agg.median,
    tookMin: agg.min,
    total: `${(last.hits.total?.value ?? 0).toLocaleString()} (${last.hits.total?.relation ?? '-'})`,
    top: last.hits.hits.map((h: any) => h._id),
    note
  }
}

/** Per-term match counts (the docFreq-analog on the union of the two fields) — used by the
 *  rare-must split; measured to show its own (tiny, docFreq-shortcut) cost. */
async function termCounts (terms: string[]): Promise<{ counts: Record<string, number>, ms: number }> {
  const t0 = performance.now()
  const counts: Record<string, number> = {}
  for (const term of terms) {
    const res = await es('POST', `/${values.index}/_count`, {
      query: { multi_match: { query: term, fields: FIELDS } }
    })
    counts[term] = res.count
  }
  return { counts, ms: performance.now() - t0 }
}

const info = await es('GET', '/')
const total = await es('GET', `/${values.index}/_count`)
console.log(`\nES ${info.version.number} @ ${values.node} — ${values.index} (${total.count.toLocaleString()} docs), runs=${runs}, ${values.cold ? 'cold' : 'warm'}`)

for (const q of QUERIES) {
  const terms = q.split(/\s+/)
  console.log(`\n=== q="${q}"`)
  const rows: Array<[string, Measured]> = []

  rows.push(['or-exact (today)', await measure({ query: sqs(q), size: 20, track_total_hits: true })])
  rows.push(['or-capped', await measure({ query: sqs(q), size: 20, track_total_hits: 10000 })])
  if (terms.length > 1) {
    rows.push(['and-exact', await measure({ query: sqs(q, { default_operator: 'and' }), size: 20, track_total_hits: true })])
    rows.push(['and-capped', await measure({ query: sqs(q, { default_operator: 'and' }), size: 20, track_total_hits: 10000 })])
    if (terms.length > 2) {
      rows.push(['msm2-exact', await measure({ query: sqs(q, { minimum_should_match: '2' }), size: 20, track_total_hits: true })])
    }

    // rare-must: require the low-frequency terms, keep high-frequency terms scoring-only
    const { counts, ms } = await termCounts(terms)
    const threshold = total.count * 0.02 // >2% of corpus = "common"
    const rare = terms.filter(t => counts[t] <= threshold)
    const common = terms.filter(t => counts[t] > threshold)
    if (rare.length > 0 && common.length > 0) {
      const body = {
        query: {
          bool: {
            must: rare.map(t => ({ multi_match: { query: t, fields: FIELDS } })),
            should: common.map(t => ({ multi_match: { query: t, fields: FIELDS } }))
          }
        },
        size: 20,
        track_total_hits: true
      }
      rows.push(['rare-must-exact', await measure(body,
        `must=[${rare.join(',')}] should=[${common.join(',')}] (term counts: ${ms.toFixed(0)}ms)`)])
    }

    // adaptive cascade: strictest first, relax while the page isn't full; cost = sum of passes
    const passes: number[] = []
    let satisfied = ''
    let final: any
    for (let msm = terms.length; msm >= 1; msm--) {
      const body = { query: sqs(q, { minimum_should_match: String(msm) }), size: 20, track_total_hits: 10000 }
      for (let w = 0; w < warmup; w++) await es('POST', `/${values.index}/_search`, body)
      const tooks: number[] = []
      for (let r = 0; r < runs; r++) {
        if (values.cold) await es('POST', `/${values.index}/_cache/clear`)
        final = await es('POST', `/${values.index}/_search`, body)
        tooks.push(final.took)
      }
      passes.push(aggregate(tooks).median)
      if (final.hits.hits.length >= 20) { satisfied = `msm=${msm}`; break }
      satisfied = `msm=${msm}`
    }
    rows.push(['adaptive-capped', {
      tookP50: passes.reduce((a, b) => a + b, 0),
      tookMin: passes.reduce((a, b) => a + b, 0),
      total: `${(final.hits.total?.value ?? 0).toLocaleString()} (${final.hits.total?.relation ?? '-'})`,
      top: final.hits.hits.map((h: any) => h._id),
      note: `settled at ${satisfied}, passes: [${passes.join(', ')}]ms`
    }])

    // reverse-adaptive: ONE _msearch of `_rand`-sampled counts at every msm level decides the
    // strictness AND provides the display total; ambiguity (sampled < CONFIDENT at a stricter
    // level) is resolved by directly running that level — cheap precisely because it's selective.
    const P = 0.01
    const RAND_BOUND = 10_000
    const CONFIDENT = 5 // sampled ≥ 5 → est ≥ 500 → the page will fill
    {
      const msearchBody = []
      const levels: number[] = []
      for (let msm = terms.length; msm >= 1; msm--) {
        levels.push(msm)
        msearchBody.push(JSON.stringify({}))
        msearchBody.push(JSON.stringify({
          query: { bool: { filter: [sqs(q, { minimum_should_match: String(msm) }), { range: { _rand: { lt: RAND_BOUND } } }] } },
          size: 0,
          track_total_hits: true
        }))
      }
      const run = async () => {
        let cost = 0
        const pre = await es('POST', `/${values.index}/_msearch`, undefined, msearchBody.join('\n') + '\n')
        const sampled: Record<number, number> = {}
        for (const [j, resp] of pre.responses.entries()) {
          sampled[levels[j]] = resp.hits.total.value
          cost += resp.took
        }
        // strictest level with confident support
        let chosen = 1
        for (const msm of levels) if (sampled[msm] >= CONFIDENT) { chosen = msm; break }
        // ambiguity: any stricter level with nonzero-but-unconfident sample → probe it directly
        let probeNote = ''
        for (const msm of levels) {
          if (msm <= chosen) break
          if (sampled[msm] > 0) {
            const probe = await es('POST', `/${values.index}/_search`,
              { query: sqs(q, { minimum_should_match: String(msm) }), size: 20, track_total_hits: 10000 })
            cost += probe.took
            if (probe.hits.hits.length >= 20 || probe.hits.total.value > 0) {
              probeNote = ` probe msm=${msm}: ${probe.hits.total.value} real`
              if (probe.hits.hits.length >= 20) { chosen = msm; return { cost, chosen, sampled, probeNote, final: probe } }
            }
          }
        }
        const final2 = await es('POST', `/${values.index}/_search`,
          { query: sqs(q, { minimum_should_match: String(chosen) }), size: 20, track_total_hits: 10000 })
        cost += final2.took
        return { cost, chosen, sampled, probeNote, final: final2 }
      }
      for (let w = 0; w < warmup; w++) await run()
      const costs: number[] = []
      let r: any
      for (let i = 0; i < runs; i++) {
        if (values.cold) await es('POST', `/${values.index}/_cache/clear`)
        r = await run()
        costs.push(r.cost)
      }
      const agg = aggregate(costs)
      const estimate = Math.round(r.sampled[r.chosen] / P)
      rows.push(['reverse-adaptive', {
        tookP50: agg.median,
        tookMin: agg.min,
        total: `${r.final.hits.total.relation === 'eq' && r.final.hits.total.value < 10000
          ? r.final.hits.total.value.toLocaleString() + ' (eq)'
          : '~' + estimate.toLocaleString() + ' (est)'}`,
        top: r.final.hits.hits.map((h: any) => h._id),
        note: `chose msm=${r.chosen}, sampled=[${levels.map(l => r.sampled[l]).join(',')}]${r.probeNote}`
      }])
    }
  }

  const baseTop = rows[0][1].top
  console.log('variant'.padEnd(18) + '| took p50 | total               | top20 vs OR | note')
  for (const [name, m] of rows) {
    const overlap = baseTop.length === 0
      ? '-'
      : `${m.top.filter(id => baseTop.includes(id)).length}/${baseTop.length}`
    console.log(name.padEnd(18) + `| ${String(m.tookP50).padStart(8)} | ${m.total.padEnd(19)} | ${overlap.padStart(11)} | ${m.note ?? ''}`)
  }
}
