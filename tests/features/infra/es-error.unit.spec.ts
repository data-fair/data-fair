import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bulkIndexingError, extractError } from '../../../api/src/datasets/es/operations.ts'

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

  // a failed bulk request used to reach the dataset journal as a bare "Failure while indexing a
  // batch of data.", the elasticsearch reason going to the server logs only
  const floodStage = 'index [dataset-test] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];'

  test('Keep the elasticsearch reason of a rejected bulk indexing request', () => {
    // shape of the @elastic/elasticsearch ResponseError
    const err = Object.assign(new Error('cluster_block_exception'), {
      name: 'ResponseError',
      meta: { statusCode: 429, body: { error: { type: 'cluster_block_exception', reason: floodStage }, status: 429 } }
    })
    assert.equal(bulkIndexingError(err).message, `Failure while indexing a batch of data: ${floodStage}`)
  })

  test('Keep the type and reason of a cluster block reported on a bulk item', () => {
    // what IndexStream.sendBulk throws when a bulk response item carries a cluster_block_exception
    const err = new Error(`cluster_block_exception - ${floodStage}`)
    assert.equal(bulkIndexingError(err).message, `Failure while indexing a batch of data: cluster_block_exception - ${floodStage}`)
  })

  test('Keep the client message when the elasticsearch node is unreachable', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9200'), { name: 'ConnectionError' })
    assert.equal(bulkIndexingError(err).message, 'Failure while indexing a batch of data: connect ECONNREFUSED 127.0.0.1:9200')
  })

  test('Do not word a bulk request timeout as a too long user query', () => {
    const err = Object.assign(new Error('Request timed out'), { name: 'TimeoutError' })
    assert.equal(bulkIndexingError(err).message, 'Failure while indexing a batch of data: Request timed out')
  })

  test('Keep a plain string error body or the status of a response without error body', () => {
    const stringBody = Object.assign(new Error('Response Error'), { name: 'ResponseError', meta: { statusCode: 400, body: { error: 'no handler found for uri' } } })
    assert.equal(bulkIndexingError(stringBody).message, 'Failure while indexing a batch of data: no handler found for uri')
    const noBody = Object.assign(new Error('Response Error'), { name: 'ResponseError', meta: { statusCode: 413, body: '' } })
    assert.equal(bulkIndexingError(noBody).message, 'Failure while indexing a batch of data: elasticsearch responded with status 413')
  })

  test('Fall back to the generic bulk indexing message without a reason', () => {
    assert.equal(bulkIndexingError(new Error('')).message, 'Failure while indexing a batch of data.')
  })
})
