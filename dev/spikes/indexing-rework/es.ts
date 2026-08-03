// Shared helpers for the indexing-rework Phase 0 spikes.
// Talks directly to the dev Elasticsearch, only touches indices prefixed "spike-".
const ES = process.env.ES_URL ?? 'http://localhost:32237'

export async function es (method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(ES + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text}`)
  return text ? JSON.parse(text) : null
}

export function assert (cond: any, msg: string) {
  if (!cond) { console.error('ASSERT FAILED: ' + msg); process.exit(1) }
}

export function finding (msg: string) {
  console.log('FINDING: ' + msg)
}

export async function resetIndex (name: string, def: any) {
  assert(name.startsWith('spike-'), 'spike indices only: ' + name)
  await es('DELETE', '/' + name).catch(() => {})
  await es('PUT', '/' + name, def)
}

export async function bulkIndex (name: string, docs: any[]) {
  for (let i = 0; i < docs.length; i += 5000) {
    const batch = docs.slice(i, i + 5000)
    const body = batch.map(d => JSON.stringify({ index: { _index: name } }) + '\n' + JSON.stringify(d)).join('\n') + '\n'
    const res = await es('POST', '/_bulk', body)
    assert(!res.errors, '_bulk errors on ' + name + ': ' + JSON.stringify(res.items.find((it: any) => it.index.error)))
  }
  await es('POST', '/' + name + '/_refresh')
  const count = await es('GET', '/' + name + '/_count')
  assert(count.count === docs.length, `expected ${docs.length} docs in ${name}, got ${count.count}`)
}

export async function time (label: string, n: number, fn: () => Promise<any>): Promise<number> {
  const times: number[] = []
  await fn() // warmup
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    await fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(n / 2)]
  console.log(`  time[${label}] median ${median.toFixed(1)}ms over ${n} runs`)
  return median
}

// Verbatim copy of the analysis block from api/src/datasets/es/manage-indices.ts (indexBase)
export const ANALYSIS_SETTINGS = {
  normalizer: {
    insensitive_normalizer: { type: 'custom', filter: ['lowercase', 'asciifolding'] }
  },
  filter: {
    french_elision: {
      type: 'elision',
      articles_case: true,
      articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c', 'jusqu', 'quoiqu', 'lorsqu', 'puisqu']
    },
    french_stop: { type: 'stop', stopwords: '_french_' },
    french_stemmer: { type: 'stemmer', language: 'light_french' }
  },
  analyzer: {
    custom_french: {
      tokenizer: 'standard',
      filter: ['french_elision', 'lowercase', 'french_stop', 'french_stemmer', 'asciifolding']
    }
  }
}
