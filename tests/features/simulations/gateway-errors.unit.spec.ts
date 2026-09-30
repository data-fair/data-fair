/**
 * A run the provider or the agents service refused must be recorded invalid,
 * never judged as a product failure.
 */

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { errorsInResponse } from '../../../simulations/runner/gateway-errors.ts'

test.describe('gateway errors', () => {
  test('reads error chunks from a 200 SSE body', () => {
    const body = 'data: {"choices":[]}\n\ndata: {"error":{"message":"rate limited"}}\n\ndata: [DONE]\n'
    assert.deepEqual(errorsInResponse(200, body), ['rate limited'])
    assert.deepEqual(errorsInResponse(200, 'data: {"choices":[]}\n\ndata: [DONE]\n'), [])
  })

  test('treats a refused request as an error, with its reason', () => {
    assert.deepEqual(errorsInResponse(429, '{"allowed":false,"reason":"Account credit limit exceeded"}'), ['HTTP 429: Account credit limit exceeded'])
    assert.deepEqual(errorsInResponse(502, '<html>Bad Gateway</html>'), ['HTTP 502'])
  })
})
