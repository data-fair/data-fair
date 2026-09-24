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

  test('column values are never indexed, only the labels', () => {
    const schema = [col('type_syndic', { title: 'Type de syndic', enum: ['professionnel', 'bénévole'] })]
    const text = computeSearchText({ schema })!
    assert.equal(text, 'Type de syndic')
  })

  test('description head is cut at a word boundary', () => {
    const description = 'mot '.repeat(80).trim() // 319 chars, words of 3
    const text = computeSearchText({ schema: [col('a', { description })] })!
    assert.ok(text.length <= SEARCH_TEXT_LIMITS.descriptionHead)
    assert.ok(text.endsWith('mot'), 'no partial word')

    // a fixture where a word genuinely straddles the 200-char boundary: a naive
    // slice(0, 200) with no last-space lookup would split "yyyy...y" mid-word
    const straddling = 'x'.repeat(195) + ' ' + 'y'.repeat(20)
    const straddlingText = computeSearchText({ schema: [col('b', { description: straddling })] })!
    assert.ok(straddlingText.length <= SEARCH_TEXT_LIMITS.descriptionHead)
    assert.ok(straddlingText.endsWith('x'.repeat(195)), 'cuts back before the straddling word, not mid-word')
    assert.doesNotMatch(straddlingText, /y/, 'no partial fragment of the straddling word')
  })

  test('description head with no space in the first 200 chars extends forward to the next word boundary, capped', () => {
    // a single unbroken 250-char token (e.g. a URL) followed by more words: the first 200 chars
    // contain no space at all, so a naive slice(0, 200) would split the token mid-word. The fix
    // looks forward for the next space instead of cutting there.
    const token = 'a'.repeat(250)
    const text = computeSearchText({ schema: [col('a', { description: token + ' suite du texte' })] })!
    assert.equal(text, token, 'extends to the token\'s own end rather than splitting it mid-word')

    // a single unbroken token longer than the 2x cap (400 chars): no space to extend to within
    // the cap, so it falls back to a hard truncation at 200 rather than growing unbounded
    const giant = 'b'.repeat(500)
    const giantText = computeSearchText({ schema: [col('b', { description: giant })] })!
    assert.equal(giantText, 'b'.repeat(SEARCH_TEXT_LIMITS.descriptionHead))
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
    // every kept line is a complete, well-formed column label — never a truncated fragment
    // (a buggy implementation that joins-then-slices at the byte boundary would produce a
    // partial last line here and fail this check even though the two asserts above still pass)
    for (const line of text.split('\n')) {
      assert.match(line, /^Colonne \d+ (libellé long ){9}libellé long$/, `line is a whole, untruncated column: ${JSON.stringify(line)}`)
    }
  })

  test('guard: a grantee with list but not readSchema drops the labels', () => {
    const schema = [col('a', { title: 'Libellé' })]
    const full = computeSearchText({ schema, permissions: [{ classes: ['list', 'read'] }] })!
    assert.match(full, /Libellé/)

    const listOnly = computeSearchText({ schema, permissions: [{ classes: ['list'] }] })
    assert.equal(listOnly, undefined)

    // list + an explicit readSchema operation is enough, no need for the whole read class
    const explicitSchema = computeSearchText({ schema, permissions: [{ classes: ['list'], operations: ['readSchema'] }] })!
    assert.match(explicitSchema, /Libellé/)

    // an org entry restricted to a role is still a grantee
    const orgListOnly = computeSearchText({ schema, permissions: [{ type: 'organization', id: 'o1', roles: ['user'], classes: ['list'] }] })
    assert.equal(orgListOnly, undefined)
    // a grantee without list at all changes nothing
    const readOnly = computeSearchText({ schema, permissions: [{ classes: ['read'] }] })!
    assert.match(readOnly, /Libellé/)
  })
})
