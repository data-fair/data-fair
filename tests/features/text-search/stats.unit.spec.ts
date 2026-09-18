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
  const c = fakeCollection()
  let capturedPipeline: any[] | null = null
  const collectingAggregate = (pipeline: any[]) => {
    capturedPipeline = pipeline
    return c.aggregate(pipeline)
  }
  const collectionWithCapture = { ...c, aggregate: collectingAggregate }

  const defWithDottedField = validateDefinition({
    fields: { 'topics.title': 3, 'owner.name': 1 },
    language: 'fr',
    version: 1
  })

  const stats = await createStatsProvider(collectionWithCapture, defWithDottedField).get(['charg'])

  // Verify the pipeline was captured
  assert.ok(capturedPipeline, 'aggregation pipeline was built')

  // Find the $group stage
  const groupStage = capturedPipeline.find(stage => stage.$group)
  assert.ok(groupStage, '$group stage exists in pipeline')

  // Verify all $group output keys are sanitised (no dots)
  const groupKeys = Object.keys(groupStage.$group)
  for (const key of groupKeys) {
    assert.match(key, /^[^.]*$/, `$group output key "${key}" must not contain dots (use sanitised keys for MongoDB)`)
  }

  // Verify the returned avgLen still has the original dotted keys
  assert.ok(stats.avgLen['topics.title'] !== undefined, 'returned avgLen has original dotted key "topics.title"')
  assert.ok(stats.avgLen['owner.name'] !== undefined, 'returned avgLen has original dotted key "owner.name"')
})
