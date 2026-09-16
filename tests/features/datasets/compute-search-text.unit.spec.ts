import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeSearchText, SEARCH_TEXT_LIMITS } from '../../../api/src/datasets/operations.ts'

const col = (key: string, extra: Record<string, any> = {}) => ({ key, type: 'string', ...extra })

test.describe('computeSearchText', () => {
  test('column titles and descriptions by default, keys never', () => {
    const text = computeSearchText({ schema: [col('p_chom1564', { title: 'Chômeurs 15-64 ans', description: 'Nombre de chômeurs au sens du recensement' })] })
    assert.ok(text)
    assert.match(text, /Chômeurs 15-64 ans/)
    assert.match(text, /Nombre de chômeurs/)
    assert.doesNotMatch(text, /p_chom1564/)
  })

  test('undefined when nothing remains', () => {
    assert.equal(computeSearchText({ schema: [col('a')] }), undefined)
    assert.equal(computeSearchText({ schema: [col('a', { title: 'A' })] }, { indexSchemaLabels: false }), undefined)
    assert.equal(computeSearchText({}), undefined)
  })

  test('x-calculated columns are skipped, extension columns are kept', () => {
    const text = computeSearchText({
      schema: [
        col('_geopoint', { title: 'Point', 'x-calculated': true }),
        col('_ext_city', { title: 'Commune enrichie', 'x-extension': 'geo' })
      ]
    })
    assert.equal(text, 'Commune enrichie')
  })

  test('enum values only when enabled, strings only, capped per value', () => {
    const schema = [col('type_syndic', { title: 'Type de syndic', enum: ['professionnel', 'bénévole', 42, 'x'.repeat(200)] })]
    assert.doesNotMatch(computeSearchText({ schema })!, /bénévole/)
    const text = computeSearchText({ schema }, { indexEnumValues: true })!
    assert.match(text, /bénévole/)
    assert.doesNotMatch(text, /42/)
    assert.doesNotMatch(text, /x{101}/)
  })

  test('description head is cut at a word boundary', () => {
    const description = 'mot '.repeat(80).trim() // 319 chars, words of 3
    const text = computeSearchText({ schema: [col('a', { description })] })!
    assert.ok(text.length <= SEARCH_TEXT_LIMITS.descriptionHead)
    assert.ok(text.endsWith('mot'), 'no partial word')
  })

  test('identical labels are deduplicated', () => {
    const text = computeSearchText({ schema: [col('a', { title: 'Femmes 15 ans' }), col('b', { title: 'Femmes 15 ans' })] })
    assert.equal(text, 'Femmes 15 ans')
  })

  test('caps drop whole columns, in schema order', () => {
    const schema = Array.from({ length: 200 }, (_, i) => col('c' + i, { title: `Colonne ${i} ` + 'libellé long '.repeat(10) }))
    const text = computeSearchText({ schema })!
    assert.ok(Buffer.byteLength(text, 'utf8') <= SEARCH_TEXT_LIMITS.labelsBytes)
    assert.match(text, /^Colonne 0 /)
    const kept = text.split('\n').length
    assert.doesNotMatch(text, new RegExp(`Colonne ${kept} `), 'the first dropped column is absent entirely')
  })

  test('guard: a grantee with list but not readSchema drops the labels, not readLines drops the enums', () => {
    const schema = [col('a', { title: 'Libellé', enum: ['valeur'] })]
    const settings = { indexEnumValues: true }
    const full = computeSearchText({ schema, permissions: [{ classes: ['list', 'read'] }] }, settings)!
    assert.match(full, /Libellé/); assert.match(full, /valeur/)

    const listOnly = computeSearchText({ schema, permissions: [{ classes: ['list'] }] }, settings)
    assert.equal(listOnly, undefined)

    const noLines = computeSearchText({ schema, permissions: [{ classes: ['list'], operations: ['readSchema'] }] }, settings)!
    assert.match(noLines, /Libellé/); assert.doesNotMatch(noLines, /valeur/)

    // an org entry restricted to a role is still a grantee
    const orgListOnly = computeSearchText({ schema, permissions: [{ type: 'organization', id: 'o1', roles: ['user'], classes: ['list'] }] }, settings)
    assert.equal(orgListOnly, undefined)
    // a grantee without list at all changes nothing
    const readOnly = computeSearchText({ schema, permissions: [{ classes: ['read'] }] }, settings)!
    assert.match(readOnly, /Libellé/)
  })
})
