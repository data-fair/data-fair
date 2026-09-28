import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineTextSearch } from '../../../api/src/misc/utils/text-search/index.ts'

const ts = defineTextSearch({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })
const statsProvider = { get: async (terms: string[]) => ({ n: 100, df: Object.fromEntries(terms.map(t => [t, 5])), avgLen: { title: 5, description: 20 } }) }

test('indexes a document end to end', () => {
  const fields = ts.buildIndexFields({ title: 'Courbe de charge' })!
  assert.ok(fields._terms.includes('courb'))
  assert.deepEqual(fields._pos.title.charg, [2])
})

test('plans a query end to end and builds a usable filter', async () => {
  const plan = (await ts.plan('courbe charge', statsProvider))!
  assert.ok(plan)
  const filter = ts.matchFilter(plan)
  assert.ok(Array.isArray(filter._terms.$in))
  assert.ok(JSON.stringify(ts.scoreExpression(plan)).includes('$max'))
})

test('plan is null when nothing is searchable', async () => {
  const empty = { get: async () => ({ n: 100, df: {}, avgLen: { title: 5, description: 20 } }) }
  assert.equal(await ts.plan('zzunknown', empty), null)
})

test('the owner scope is forwarded to the stats provider', async () => {
  let seen: any
  const spy = { get: async (terms: string[], scope: any) => { seen = scope; return { n: 10, df: Object.fromEntries(terms.map(t => [t, 2])), avgLen: { title: 5, description: 20 } } } }
  await ts.plan('charge', spy, { 'owner.id': 'x' })
  assert.deepEqual(seen, { 'owner.id': 'x' })
})

test('an invalid definition is refused at construction', () => {
  assert.throws(() => defineTextSearch({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: 1 }), /gateSize/)
})
