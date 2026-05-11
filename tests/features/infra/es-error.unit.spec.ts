import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { extractError } from '../../../api/src/datasets/es/operations.ts'

test.describe('ES error extraction', () => {
  test('Extract message from another ES error', () => {
    const { message, status } = extractError({
      error: {
        root_cause: [{ type: 'remote_transport_exception', reason: '[master5][10.0.11.177:9300][indices:admin/create]' }],
        type: 'illegal_argument_exception',
        reason: 'Validation Failed: 1: this action would add [2] total shards, but this cluster currently has [3456]/[3000] maximum shards open;'
      },
      status: 400
    })
    assert.equal(message, 'Validation Failed: 1: this action would add [2] total shards, but this cluster currently has [3456]/[3000] maximum shards open; - [master5][10.0.11.177:9300][indices:admin/create]')
    assert.equal(status, 400)
  })

  test('Map an aborted request (http client gave up) to a 499', () => {
    const { status } = extractError({ name: 'RequestAbortedError', message: 'Request aborted' })
    assert.equal(status, 499)
  })

  test('Map an elasticsearch client TimeoutError to a 504 with the "too long" message', () => {
    const { message, status } = extractError({ name: 'TimeoutError', message: 'Request timed out' })
    assert.equal(status, 504)
    assert.ok(message.includes('trop longue'))
  })
})
