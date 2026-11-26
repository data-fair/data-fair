import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getFlattenNoCache } from '../../../api/src/datasets/utils/flatten.ts'

// flatten is compiled from the dataset schema: keys, separators and fillNull keys
// may hold any character and must be applied exactly as written

test.describe('flatten', () => {
  test('joins separator arrays, moves nested keys and fills nulls', () => {
    const flatten = getFlattenNoCache({
      schema: [
        { key: 'tags', separator: ', ' },
        { key: 'ext.a' },
        { key: 'ext.b.c' }
      ]
    }, false, ['missing'])
    const line = flatten({ tags: ['a', 'b'], ext: { a: 1, 'b.c': 2 } })
    assert.deepEqual(line, { tags: 'a, b', 'ext.a': 1, 'ext.b.c': 2, missing: null })
  })

  test('separators with quotes and parentheses are joined as written', () => {
    const separator = '");(function(){return["x"]})().join("'
    const flatten = getFlattenNoCache({ schema: [{ key: 'tags', separator }] })
    assert.equal(flatten({ tags: ['a', 'b'] }).tags, 'a' + separator + 'b')
  })

  test('quotes, backslashes and line breaks in keys and separators', () => {
    const key = 'k"\\\n\u2028]'
    const flatten = getFlattenNoCache({ schema: [{ key, separator: '"\\\n' }] }, false, [key + 'x'])
    const line = flatten({ [key]: ['a', 'b'] })
    assert.deepEqual(line, { [key]: 'a"\\\nb', [key + 'x']: null })
  })

  test('nested and filled keys with quotes and brackets', () => {
    const key = 'x"]);//'
    const flatten = getFlattenNoCache({
      schema: [
        { key, separator: ',' },
        { key: 'a.' + key },
        { key: 'b.' + key + '.c' }
      ]
    }, false, [key + 'y'])
    const line = flatten({ [key]: ['a', 'b'], a: { [key]: 1 }, b: { [key + '.c']: 2 } })
    assert.deepEqual(line, { [key]: 'a,b', ['a.' + key]: 1, ['b.' + key + '.c']: 2, [key + 'y']: null })
  })
})
