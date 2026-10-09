import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineTextSearch, indexPatch, assignIndexFields, mergeIndexUpdate } from '../../../api/src/misc/utils/text-search/index.ts'

const textSearch = defineTextSearch({ fields: { title: 1 }, language: 'fr', version: 3 })

test.describe('indexPatch', () => {
  test('carries the index fields and stamps the definition version', () => {
    const patch = indexPatch(textSearch, { title: 'donnees ouvertes' })
    assert.deepEqual(patch._terms, ['donn', 'ouvert'])
    assert.equal(patch._searchIndex.v, 3)
    assert.ok(patch._pos.title.donn)
  })

  test('a document with nothing indexable gets nulls, not empty structures', () => {
    const patch = indexPatch(textSearch, {})
    assert.equal(patch._terms, null)
    assert.equal(patch._pos, null)
    assert.equal(patch._len, null)
  })

  test('always clears the pending stale flag — building the patch IS the recompute', () => {
    assert.equal(indexPatch(textSearch, { title: 'donnees' })._needsSearchIndex, null)
    assert.equal(indexPatch(textSearch, {})._needsSearchIndex, null)
  })
})

test.describe('assignIndexFields', () => {
  test('sets the present fields and deletes the null ones', () => {
    const doc: Record<string, any> = { title: 'gardé', _terms: ['stale'], _needsSearchIndex: true }
    assignIndexFields(doc, indexPatch(textSearch, { title: 'gardé' }))
    assert.equal(doc.title, 'gardé')
    assert.deepEqual(doc._terms, ['gard'])
    assert.ok(!('_needsSearchIndex' in doc), 'the flag is removed, not set to null')
  })

  test('a document that loses its indexable content keeps no index field behind', () => {
    const doc: Record<string, any> = { _terms: ['stale'], _pos: { title: {} }, _len: { title: 1 } }
    assignIndexFields(doc, indexPatch(textSearch, {}))
    for (const key of ['_terms', '_pos', '_len']) assert.ok(!(key in doc), `${key} must be removed`)
  })
})

test.describe('mergeIndexUpdate', () => {
  test('routes present fields to $set and null ones to $unset', () => {
    const update = mergeIndexUpdate({ $set: { title: 'donnees' } }, indexPatch(textSearch, { title: 'donnees' }))
    assert.equal(update.$set.title, 'donnees')
    assert.deepEqual(update.$set._terms, ['donn'])
    assert.deepEqual(update.$unset, { _needsSearchIndex: '' })
  })

  test('an empty index produces no $set key for the index fields', () => {
    const update = mergeIndexUpdate({ $set: { title: '' } }, indexPatch(textSearch, {}))
    assert.ok(!('_terms' in update.$set))
    for (const key of ['_terms', '_pos', '_len', '_needsSearchIndex']) {
      assert.equal(update.$unset![key], '', `${key} must be unset`)
    }
  })

  test('creates $set and $unset when the caller supplied neither', () => {
    const update = mergeIndexUpdate({} as { $set?: Record<string, any>, $unset?: Record<string, any> }, indexPatch(textSearch, { title: 'donnees' }))
    assert.ok(update.$set?._terms)
    assert.ok(update.$unset?._needsSearchIndex !== undefined)
  })
})
