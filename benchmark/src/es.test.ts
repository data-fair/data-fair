import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aliasName } from './es.ts'

test('aliasName joins the indices prefix and dataset id', () => {
  assert.equal(aliasName('dataset-benchmark', 'bench-tall'), 'dataset-benchmark-bench-tall')
})
