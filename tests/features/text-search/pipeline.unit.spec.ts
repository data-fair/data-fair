import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { parseQuery, planQuery } from '../../../api/src/misc/utils/text-search/query.ts'
import { matchFilter, scoreExpression, sortSpec, INDEX_FIELD_NAMES } from '../../../api/src/misc/utils/text-search/pipeline.ts'

const analyzer = createAnalyzer('fr')
const def = validateDefinition({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })
const plan = (q: string, df: Record<string, number>) =>
  planQuery(parseQuery(q, analyzer), { n: 1000, df, avgLen: { title: 10, description: 50 } }, def)!

test('the filter gates on _terms', () => {
  const f = matchFilter(plan('charge gaz', { charg: 100, gaz: 5 }), def)
  assert.deepEqual(f._terms, { $in: ['gaz', 'charg'] })
})

test('negated terms add a $nin clause', () => {
  const f = matchFilter(plan('charge -gaz', { charg: 100, gaz: 5 }), def)
  assert.deepEqual(f._terms.$nin, ['gaz'])
})

test('a phrase adds an $expr clause, keeping the filter usable by find() and countDocuments()', () => {
  const f = matchFilter(plan('"courbe de charge"', { courb: 50, charg: 100 }), def)
  assert.ok(f.$expr, 'the phrase predicate must ride in the same filter object')
  assert.deepEqual(f._terms.$in.sort(), ['charg', 'courb'])
})

test('no phrase means no $expr', () => {
  assert.equal(matchFilter(plan('charge', { charg: 100 }), def).$expr, undefined)
})

test('the score is a dis_max over per-field scores, not a sum', () => {
  const expr = scoreExpression(plan('charge', { charg: 100 }), def)
  const json = JSON.stringify(expr)
  assert.ok(json.includes('$max'), 'dis_max requires $max over the field scores')
  assert.ok(json.includes('0.3'), 'the tie_breaker must appear')
})

test('term frequency is read as the size of the position array', () => {
  const json = JSON.stringify(scoreExpression(plan('charge', { charg: 100 }), def))
  assert.ok(json.includes('$size'), 'tf comes from $size of _pos, since _tf does not exist')
  assert.ok(json.includes('$_pos.title.charg'))
})

test('the sort always carries a deterministic tie-break', () => {
  assert.deepEqual(sortSpec(def), { _score: -1, id: 1 })
})

test('INDEX_FIELD_NAMES lists exactly the fields that must never reach a response', () => {
  // this list is the single source of truth for the projection excludes and clean() in Task 7
  assert.deepEqual([...INDEX_FIELD_NAMES], ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex'])
})

test('a definition with dotted fields produces paths using sanitised keys', () => {
  const dottedDef = validateDefinition({ fields: { 'topics.title': 3, description: 1 }, language: 'fr', version: 1 })
  const dottedPlan = (q: string, df: Record<string, number>) =>
    planQuery(parseQuery(q, analyzer), { n: 1000, df, avgLen: { 'topics.title': 10, description: 50 } }, dottedDef)!
  const expr = scoreExpression(dottedPlan('charge', { charg: 100 }), dottedDef)
  const json = JSON.stringify(expr)
  // The generated expression must use sanitised keys, not the dotted original
  assert.ok(json.includes('$_pos.topics_title.charg'), 'must use sanitised key topics_title, not topics.title')
  assert.ok(json.includes('$_len.topics_title'), 'must use sanitised key for field length')
})
