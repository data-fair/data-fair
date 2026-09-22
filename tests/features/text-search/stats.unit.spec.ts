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
  assert.equal(groupStage.$group.description.$avg, '$_len.description', 'non-dotted field read path: $_len.description')
  // Dotted fields read from sanitised paths: topics.title -> $_len.topics_title, owner.name -> $_len.owner_name
  assert.equal(groupStage.$group.topics_title.$avg, '$_len.topics_title', 'dotted field read path: topics.title -> $_len.topics_title (sanitised)')
  assert.equal(groupStage.$group.owner_name.$avg, '$_len.owner_name', 'dotted field read path: owner.name -> $_len.owner_name (sanitised)')

  // Verify the round-trip: sanitised $group output is read back under original dotted keys
  // Non-dotted field: 'description' -> 'description'
  assert.equal(stats.avgLen.description, 8, 'non-dotted field round-trips: description=8')
  // Dotted fields map through sanitisation: 'topics.title' -> 'topics_title' -> 'topics.title'
  assert.equal(stats.avgLen['topics.title'], 42, 'dotted field round-trips: topics.title=42 (via topics_title key)')
  assert.equal(stats.avgLen['owner.name'], 33, 'dotted field round-trips: owner.name=33 (via owner_name key)')
})
