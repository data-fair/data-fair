import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { allInteractions, parseInteractions } from '../../../ui/src/composables/dataset/interactions.ts'

test.describe('parseInteractions', () => {
  test('activates everything when the param is absent or truthy', () => {
    for (const param of [undefined, null, '1', 'true']) {
      assert.deepEqual(parseInteractions(param), [...allInteractions], `param=${param}`)
    }
  })

  test('activates nothing on the legacy falsy values', () => {
    assert.deepEqual(parseInteractions('0'), [])
    assert.deepEqual(parseInteractions('false'), [])
    // the param used to be a boolean one, a legacy "?interaction=" meant no interaction at all.
    // the callers pass "1" for an absent param, so "" only ever comes from such a legacy embed
    assert.deepEqual(parseInteractions(''), [])
  })

  test('keeps only the listed elements, in the reference order', () => {
    assert.deepEqual(parseInteractions('search,count'), ['count', 'search'])
    assert.deepEqual(parseInteractions('select-cols'), ['select-cols'])
  })

  test('keeps the column selection and the fixed column independent', () => {
    assert.deepEqual(parseInteractions('select-cols'), ['select-cols'])
    assert.deepEqual(parseInteractions('fix-cols'), ['fix-cols'])
    assert.deepEqual(parseInteractions('-fix-cols'), allInteractions.filter(i => i !== 'fix-cols'))
    assert.deepEqual(parseInteractions('-select-cols'), allInteractions.filter(i => i !== 'select-cols'))
  })

  test('removes the negated elements from the full list', () => {
    assert.deepEqual(parseInteractions('-filters'), allInteractions.filter(i => i !== 'filters'))
    assert.deepEqual(parseInteractions('-filters,-sort'), allInteractions.filter(i => i !== 'filters' && i !== 'sort'))
  })

  test('applies negative tokens after positive ones', () => {
    assert.deepEqual(parseInteractions('count,search,-search'), ['count'])
    assert.deepEqual(parseInteractions('-search,count,search'), ['count'])
  })

  test('tolerates spacing and empty tokens', () => {
    assert.deepEqual(parseInteractions(' count , search '), ['count', 'search'])
    assert.deepEqual(parseInteractions('count,,search,'), ['count', 'search'])
  })

  test('ignores unknown tokens rather than failing', () => {
    // a "-newToken" written against a newer version must stay harmless
    assert.deepEqual(parseInteractions('-newToken'), [...allInteractions])
    assert.deepEqual(parseInteractions('count,newToken'), ['count'])
    // a param listing only unknown tokens matches nothing, it does not fall back to everything
    assert.deepEqual(parseInteractions('newToken'), [])
  })
})
