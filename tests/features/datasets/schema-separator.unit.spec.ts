import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validate } from '../../../api/doc/datasets/patch-req/index.js'

const patchReq = (separator: any) => ({ body: { schema: [{ key: 'tags', type: 'string', separator }] }, query: {} })

test.describe('schema property separator', () => {
  test('accepts the usual separators and null', () => {
    for (const separator of [', ', '; ', ' | ', null]) {
      assert.ok(validate(patchReq(separator)), JSON.stringify((validate as any).errors))
    }
  })

  test('refuses a non string or an overly long separator', () => {
    assert.equal(validate(patchReq(1)), false)
    assert.equal(validate(patchReq('-'.repeat(21))), false)
  })
})
