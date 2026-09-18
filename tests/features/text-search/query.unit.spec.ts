import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { parseQuery, planQuery, queryTerms } from '../../../api/src/misc/utils/text-search/query.ts'

const analyzer = createAnalyzer('fr')
const def = validateDefinition({ fields: { title: 3 }, language: 'fr', version: 1 })
const stats = (df: Record<string, number>, n = 1000) => ({ n, df, avgLen: { title: 10 } })

test.describe('parseQuery', () => {
  test('plain words are positive terms', () => {
    assert.deepEqual(parseQuery('charges communes', analyzer).positive, ['charg', 'commun'])
  })

  test('a leading dash negates', () => {
    const p = parseQuery('charge -commune', analyzer)
    assert.deepEqual(p.positive, ['charg'])
    assert.deepEqual(p.negated, ['commun'])
  })

  test('a quoted group becomes a phrase carrying its raw offsets', () => {
    const p = parseQuery('"courbe de charge" annuelle', analyzer)
    assert.deepEqual(p.phrases, [[{ term: 'courb', delta: 0 }, { term: 'charg', delta: 2 }]])
    // phrase terms are also positive, so they take part in scoring
    assert.ok(p.positive.includes('courb') && p.positive.includes('charg') && p.positive.includes('annuel'))
  })

  test('a one-word quote is not a phrase', () => {
    assert.deepEqual(parseQuery('"charge"', analyzer).phrases, [])
  })

  test('an unterminated quote is treated as plain text', () => {
    assert.deepEqual(parseQuery('"courbe de charge', analyzer).phrases, [])
  })
})

test.describe('planQuery', () => {
  test('drops terms absent from the corpus', () => {
    const plan = planQuery(parseQuery('charge zzunknown', analyzer), stats({ charg: 10 }), def)!
    assert.deepEqual(plan.terms, ['charg'])
  })

  test('returns null when NO positive term survives — the caller must render no results', () => {
    assert.equal(planQuery(parseQuery('zzunknown', analyzer), stats({}), def), null)
    assert.equal(planQuery(parseQuery('', analyzer), stats({}), def), null)
  })

  test('returns null for a query that is only negations', () => {
    assert.equal(planQuery(parseQuery('-charge', analyzer), stats({ charg: 10 }), def), null)
  })

  test('the gate is the rarest gateSize terms', () => {
    const parsed = parseQuery('commune charge annuelle gaz', analyzer)
    const plan = planQuery(parsed, stats({ commun: 900, charg: 500, annuel: 100, gaz: 5 }), def)!
    assert.deepEqual(plan.gate.sort(), ['annuel', 'charg', 'gaz'].sort())
  })

  test('phrase terms are ALL in the gate, however common', () => {
    // four terms against a rarest-3 gate, with the phrase's two terms the COMMONEST: without the
    // phrase rule they fall outside the gate, so this test can actually fail
    const parsed = parseQuery('"courbe de charge" gaz eolien', analyzer)
    const plan = planQuery(parsed, stats({ courb: 900, charg: 950, gaz: 1, eolien: 2 }), def)!
    assert.equal(def.gateSize, 3)
    assert.ok(plan.gate.includes('courb'), 'a common phrase term must still be gated on')
    assert.ok(plan.gate.includes('charg'), 'a common phrase term must still be gated on')
    assert.ok(plan.gate.length > def.gateSize, 'the phrase widens the gate beyond rarest-K')
  })

  test('idf falls as df rises', () => {
    const plan = planQuery(parseQuery('charge gaz', analyzer), stats({ charg: 900, gaz: 2 }), def)!
    assert.ok(plan.idf.gaz > plan.idf.charg)
  })

  test('negated terms are carried but never scored', () => {
    const plan = planQuery(parseQuery('charge -gaz', analyzer), stats({ charg: 10, gaz: 5 }), def)!
    assert.deepEqual(plan.negated, ['gaz'])
    assert.equal(plan.idf.gaz, undefined)
  })
})

test('queryTerms lists every term needing a df lookup', () => {
  const p = parseQuery('charge -gaz "courbe de charge"', analyzer)
  assert.deepEqual(queryTerms(p).sort(), ['charg', 'courb', 'gaz'])
})
