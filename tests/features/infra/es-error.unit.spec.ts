import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bulkIndexingError, extractError, writeErrorReason } from '../../../api/src/datasets/es/operations.ts'

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
    assert.ok(message.includes('too long'))
  })

  // shape of the @elastic/elasticsearch ResponseError: its message is built from the body
  // (error type, JSON of a body without error type, raw body, 'Response Error' without body)
  const responseError = (statusCode: number, body: any, message = 'Response Error') =>
    Object.assign(new Error(message), { name: 'ResponseError', meta: { statusCode, body } })

  test('Read a plain string error body', () => {
    const { message, status } = extractError(responseError(400, { error: 'no handler found for uri' }, '{"error":"no handler found for uri"}'))
    assert.equal(message, 'no handler found for uri')
    assert.equal(status, 400)
  })

  test('Use the status of a response without error body', () => {
    const { message, status } = extractError(responseError(413, ''))
    assert.equal(message, 'elasticsearch responded with status 413')
    assert.equal(status, 413)
  })

  test('Use the error type of a body without reason', () => {
    assert.equal(extractError(responseError(500, { error: { type: 'some_exception' } }, 'some_exception')).message, 'some_exception')
  })

  test('Never return an empty message', () => {
    assert.equal(extractError(new Error('')).message, 'Unknown elasticsearch error')
    assert.equal(extractError({}).message, 'Unknown elasticsearch error')
    assert.equal(extractError(undefined).message, 'Unknown elasticsearch error')
  })

  test('Keep the client message of a write request timeout or abort', () => {
    assert.equal(writeErrorReason(Object.assign(new Error('Request timed out'), { name: 'TimeoutError' })), 'Request timed out')
    assert.equal(writeErrorReason(Object.assign(new Error('Request aborted'), { name: 'RequestAbortedError' })), 'Request aborted')
  })

  // a failed bulk request used to reach the dataset journal as a bare "Failure while indexing a
  // batch of data.", the elasticsearch reason going to the server logs only
  const floodStage = 'index [dataset-test] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];'

  test('Keep the elasticsearch reason of a rejected bulk indexing request', () => {
    const err = responseError(429, { error: { type: 'cluster_block_exception', reason: floodStage }, status: 429 }, 'cluster_block_exception')
    const bulkErr = bulkIndexingError(err)
    assert.equal(bulkErr.message, `Failure while indexing a batch of data: ${floodStage}`)
    assert.equal(bulkErr.cause, err)
  })

  test('Keep the message of a cluster block reported on a bulk item', () => {
    // what IndexStream.sendBulk throws when a bulk response item carries a cluster_block_exception
    const err = new Error(`cluster_block_exception - ${floodStage}`)
    assert.equal(bulkIndexingError(err).message, `Failure while indexing a batch of data: cluster_block_exception - ${floodStage}`)
  })

  test('Keep the client message when the elasticsearch node is unreachable', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9200'), { name: 'ConnectionError' })
    assert.equal(bulkIndexingError(err).message, 'Failure while indexing a batch of data: connect ECONNREFUSED 127.0.0.1:9200')
  })
})
