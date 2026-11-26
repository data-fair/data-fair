import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import queryParser from 'lucene-query-parser'
import { qsForParser } from '../../../../api/src/datasets/es/operations.ts'

const fields = (node: any, acc: string[] = []): string[] => {
  if (!node || typeof node !== 'object') return acc
  if (node.field) acc.push(node.field)
  fields(node.left, acc)
  fields(node.right, acc)
  return acc
}
const parsedFields = (qs: string) => fields(queryParser.parse(qsForParser(qs)))

test.describe('qs prepared for the field check', () => {
  test('escaped quotes inside phrases are accepted', () => {
    assert.deepEqual(parsedFields('name:"a \\" b"'), ['name'])
  })

  test('an escaped backslash before a quote still closes the phrase', () => {
    assert.ok(parsedFields('"a\\\\" other:[m TO n] "b\\\\"').includes('other'))
    assert.ok(parsedFields('name:"a\\\\" OR other:b').includes('other'))
  })
})
