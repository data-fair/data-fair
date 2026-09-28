import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { createStatsProvider } from '../../../api/src/misc/utils/text-search/stats.ts'

const def = validateDefinition({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })

const fakeCollection = () => {
  const calls: any[] = []
  return {
    calls,
    estimatedDocumentCount: async () => { calls.push(['estimated']); return 1000 },
    countDocuments: async (filter: any) => { calls.push(['count', filter]); return filter._terms === 'charg' ? 400 : 7 },
    aggregate: (pipeline: any[]) => ({ toArray: async () => { calls.push(['aggregate', pipeline]); return [{ title: 8, description: 40 }] } })
  }
}

test('returns n, df per term and avgLen per field', async () => {
  const stats = await createStatsProvider(fakeCollection(), def).get(['charg', 'gaz'])
  assert.equal(stats.n, 1000)
  assert.deepEqual(stats.df, { charg: 400, gaz: 7 })
  assert.deepEqual(stats.avgLen, { title: 8, description: 40 })
})

test('memoizes — a repeated term is not counted twice', async () => {
  const c = fakeCollection()
  const provider = createStatsProvider(c, def)
  await provider.get(['charg'])
  await provider.get(['charg'])
  assert.equal(c.calls.filter(x => x[0] === 'count').length, 1)
})

test('a zero df is never memoized: a term that later exists is found on the very next query', async () => {
  // planQuery drops any term whose df is 0 as unknown — so unlike a stale non-zero df (which only
  // shifts ranking a little), a memoized zero would silently remove a term from the query plan
  // even after documents containing it exist, for the rest of the cache's TTL. A fake collection
  // whose answer for 'novel' flips from 0 to 1 catches exactly that regression.
  let novelExists = false
  const c = {
    calls: [] as any[],
    estimatedDocumentCount: async () => 1000,
    countDocuments: async (filter: any) => {
      c.calls.push(['count', filter])
      if (filter._terms === 'novel') return novelExists ? 1 : 0
      return 7
    },
    aggregate: (pipeline: any[]) => ({ toArray: async () => { c.calls.push(['aggregate', pipeline]); return [{ title: 8, description: 40 }] } })
  }
  const provider = createStatsProvider(c, def)

  const before = await provider.get(['novel'])
  assert.equal(before.df.novel, 0, 'the term does not exist yet')

  novelExists = true
  const after = await provider.get(['novel'])
  assert.equal(after.df.novel, 1, 'a memoized zero must not hide a term that now exists')
})

test('an owner scope is part of the count filter AND of the cache key', async () => {
  const c = fakeCollection()
  const provider = createStatsProvider(c, def)
  await provider.get(['charg'], { 'owner.type': 'organization', 'owner.id': 'a' })
  await provider.get(['charg'], { 'owner.type': 'organization', 'owner.id': 'b' })
  const dfCounts = c.calls.filter(x => x[0] === 'count' && x[1]._terms)
  assert.equal(dfCounts.length, 2, 'different owners must not share a cached df')
  assert.equal(dfCounts[0][1]['owner.id'], 'a')
})

test('n is counted rather than estimated when owner-scoped', async () => {
  const c = fakeCollection()
  await createStatsProvider(c, def).get(['charg'], { 'owner.id': 'a' })
  assert.equal(c.calls.filter(x => x[0] === 'estimated').length, 0)
})

test('no terms means no counting at all', async () => {
  const c = fakeCollection()
  const stats = await createStatsProvider(c, def).get([])
  assert.deepEqual(stats.df, {})
  assert.equal(c.calls.filter(x => x[0] === 'count').length, 0)
})

// every "$..." field path an $avg expression reads, whatever expression wraps it
const avgReadPaths = (expr: any): string[] => {
  if (typeof expr === 'string') return expr.startsWith('$') ? [expr] : []
  if (Array.isArray(expr)) return [...new Set(expr.flatMap(avgReadPaths))]
  if (expr && typeof expr === 'object') return [...new Set(Object.values(expr).flatMap(avgReadPaths))]
  return []
}

// Evaluates a $group stage over in-memory documents, for the only operators averageLengths may
// use: $avg of a field path, $cond, $gt and literals. Anything else throws, so a pipeline that
// grows an operator this does not know fails loudly instead of being evaluated wrong.
const evalGroup = (group: Record<string, any>, docs: any[]) => {
  const get = (doc: any, path: string) => path.slice(1).split('.').reduce((v, k) => v?.[k], doc)
  const evalExpr = (expr: any, doc: any): any => {
    if (typeof expr === 'string' && expr.startsWith('$')) return get(doc, expr)
    if (expr === null || typeof expr !== 'object') return expr
    if ('$cond' in expr) return evalExpr(expr.$cond[0], doc) ? evalExpr(expr.$cond[1], doc) : evalExpr(expr.$cond[2], doc)
    if ('$gt' in expr) {
      const [a, b] = expr.$gt.map((e: any) => evalExpr(e, doc))
      // BSON order: null/missing sort before numbers, so they are never > 0
      return a !== null && a !== undefined && a > b
    }
    throw new Error('unsupported expression ' + JSON.stringify(expr))
  }
  const row: Record<string, any> = {}
  for (const [key, acc] of Object.entries(group)) {
    if (key === '_id') continue
    // $avg ignores null and missing values, and averages nothing to null
    const values = docs.map(d => evalExpr(acc.$avg, d)).filter(v => typeof v === 'number')
    row[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }
  return row
}

test('avgLen averages a field over the documents that have it, not over the whole corpus', async () => {
  // Every indexed document stores _len.<field> = 0 for the fields it lacks. Counting those zeros
  // makes a rarely-filled field look short on average, and BM25 then penalises every hit in it
  // as if the field were far longer than usual: one 3-term searchTerms among 12 datasets averaged
  // 0.25, and the weight-3 field lost to a weight-1 description.
  const docs = [
    { _len: { title: 4, description: 10 } },
    { _len: { title: 6, description: 0 } },
    { _len: { title: 2, description: 0 } },
    { _len: { title: 0, description: 20 } },
    // a document never indexed at all carries no _len; it must not count either
    {}
  ]
  const c = {
    estimatedDocumentCount: async () => docs.length,
    countDocuments: async () => 1,
    aggregate: (pipeline: any[]) => ({ toArray: async () => [evalGroup(pipeline.find(s => s.$group).$group, docs)] })
  }
  const stats = await createStatsProvider(c, def).get(['charg'])
  assert.deepEqual(stats.avgLen, { title: 4, description: 15 })
})

test('avgLen falls back to 1 for a field no document has', async () => {
  const docs = [{ _len: { title: 4, description: 0 } }, { _len: { title: 6, description: 0 } }]
  const c = {
    estimatedDocumentCount: async () => docs.length,
    countDocuments: async () => 1,
    aggregate: (pipeline: any[]) => ({ toArray: async () => [evalGroup(pipeline.find(s => s.$group).$group, docs)] })
  }
  const stats = await createStatsProvider(c, def).get(['charg'])
  assert.deepEqual(stats.avgLen, { title: 5, description: 1 })
})

test('aggregation pipeline uses sanitised field keys (no dots in $group output)', async () => {
  const captured: { pipeline: any[] | null } = { pipeline: null }
  const collectionWithCapture = {
    calls: [],
    estimatedDocumentCount: async () => 1000,
    countDocuments: async (filter: any) => filter._terms === 'charg' ? 400 : 7,
    aggregate: (pipeline: any[]) => {
      captured.pipeline = pipeline
      // Return values keyed by sanitised field names with distinctive values to detect regressions
      return { toArray: async () => [{ description: 8, topics_title: 42, owner_name: 33 }] }
    }
  }

  const defWithDottedField = validateDefinition({
    fields: { description: 1, 'topics.title': 3, 'owner.name': 2 },
    language: 'fr',
    version: 1
  })

  const stats = await createStatsProvider(collectionWithCapture, defWithDottedField).get(['charg'])

  // Verify the pipeline was captured
  assert.ok(captured.pipeline, 'aggregation pipeline was built')

  // Find the $group stage
  const groupStage = captured.pipeline.find(stage => stage.$group)
  assert.ok(groupStage, '$group stage exists in pipeline')

  // Verify all $group output keys are sanitised (no dots)
  const groupKeys = Object.keys(groupStage.$group)
  for (const key of groupKeys) {
    assert.match(key, /^[^.]*$/, `$group output key "${key}" must not contain dots (use sanitised keys for MongoDB)`)
  }

  // Verify $avg read paths are sanitised — this catches regressions in the pipeline builder
  // The fake collection ignores the pipeline, so we must assert on the pipeline itself
  // Non-dotted field: description reads from $_len.description
  assert.deepEqual(avgReadPaths(groupStage.$group.description.$avg), ['$_len.description'], 'non-dotted field read path: $_len.description')
  // Dotted fields read from sanitised paths: topics.title -> $_len.topics_title, owner.name -> $_len.owner_name
  assert.deepEqual(avgReadPaths(groupStage.$group.topics_title.$avg), ['$_len.topics_title'], 'dotted field read path: topics.title -> $_len.topics_title (sanitised)')
  assert.deepEqual(avgReadPaths(groupStage.$group.owner_name.$avg), ['$_len.owner_name'], 'dotted field read path: owner.name -> $_len.owner_name (sanitised)')

  // Verify the round-trip: sanitised $group output is read back under original dotted keys
  // Non-dotted field: 'description' -> 'description'
  assert.equal(stats.avgLen.description, 8, 'non-dotted field round-trips: description=8')
  // Dotted fields map through sanitisation: 'topics.title' -> 'topics_title' -> 'topics.title'
  assert.equal(stats.avgLen['topics.title'], 42, 'dotted field round-trips: topics.title=42 (via topics_title key)')
  assert.equal(stats.avgLen['owner.name'], 33, 'dotted field round-trips: owner.name=33 (via owner_name key)')
})
