import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeFinalizeWarnings, computeIgnoredKeywordFields } from '../../../api/src/datasets/es/diagnose-warnings.ts'

const cfg = { nbReplicas: 1, maxShardSize: 5e10, diagnose: { segmentsPerShardWarn: 99, deletedRatioWarn: 0.9, mappingFieldsLimitWarn: 0.9, minShardSize: 0 } }
const baseIndex = { health: 'green', definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } } }
const storage = { indexed: { size: 0 } }

test.describe('ignored keyword fields', () => {
  test('computeIgnoredKeywordFields maps key and .keyword_insensitive back to the column', () => {
    const dataset = { schema: [{ key: 'plain', type: 'string' }, { key: 'other', type: 'string' }] }
    assert.deepEqual(computeIgnoredKeywordFields(dataset, { ignoredFields: ['plain'] }), ['plain'])
    assert.deepEqual(computeIgnoredKeywordFields(dataset, { ignoredFields: ['other.keyword_insensitive'] }), ['other'])
    assert.deepEqual(computeIgnoredKeywordFields(dataset, { ignoredFields: [] }), [])
  })

  test('IgnoredKeywordValues fires for a flagged column without wildcard', () => {
    const dataset = { id: 'd', schema: [{ key: 'plain', type: 'string' }], storage }
    const w = computeFinalizeWarnings(dataset, { index: baseIndex, ignoredFields: ['plain'] }, cfg as any)
    assert.ok(w.find(x => x.code === 'IgnoredKeywordValues'))
  })

  test('IgnoredKeywordValues does NOT fire when the flagged column has wildcard', () => {
    const dataset = { id: 'd', schema: [{ key: 'plain', type: 'string', 'x-capabilities': { wildcard: true } }], storage }
    const w = computeFinalizeWarnings(dataset, { index: baseIndex, ignoredFields: ['plain'] }, cfg as any)
    assert.equal(w.find(x => x.code === 'IgnoredKeywordValues'), undefined)
  })

  test('IgnoredKeywordValues does NOT fire when nothing dropped', () => {
    const dataset = { id: 'd', schema: [{ key: 'plain', type: 'string' }], storage }
    const w = computeFinalizeWarnings(dataset, { index: baseIndex, ignoredFields: [] }, cfg as any)
    assert.equal(w.find(x => x.code === 'IgnoredKeywordValues'), undefined)
  })
})
