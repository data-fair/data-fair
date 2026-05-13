import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { parseIndexName } from '../../../api/src/datasets/es/index-utils.ts'

const sha = (id: string) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 12)
const prefix = 'dataset-test'

test.describe('parseIndexName', () => {
  test('returns dataset id for a current-style index', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}`, prefix), id)
  })

  test('returns dataset id for an index with timestamp suffix', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}-1700000000000`, prefix), id)
  })

  test('returns dataset id when id contains hyphens', () => {
    const id = 'has-multiple-hyphens-in-id'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}`, prefix), id)
  })

  test('returns null for an index not matching the prefix', () => {
    assert.equal(parseIndexName('something-else-foo-abcdef012345', prefix), null)
  })

  test('returns null when the 12-hex segment does not match the id hash', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-deadbeef0123`, prefix), null)
  })

  test('returns null when the structure is malformed', () => {
    assert.equal(parseIndexName(`${prefix}-incomplete`, prefix), null)
    assert.equal(parseIndexName('', prefix), null)
    assert.equal(parseIndexName(`${prefix}-`, prefix), null)
  })

  test('ignores draft-prefixed indices (separate alias scheme)', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}_draft-${id}-${sha(id)}`, prefix), null)
  })
})
