import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@elastic/elasticsearch'
import { GuardedUndiciConnection } from '../../../api/src/es-connection.ts'

test.describe('elasticsearch connection', () => {
  test('a response refused for its size fails the request without an unhandled error', async () => {
    const server = http.createServer((req, res) => {
      const body = JSON.stringify({ hits: { total: { value: 0 }, hits: [] }, pad: 'x'.repeat(1000) })
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-elastic-product': 'Elasticsearch' })
      res.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const client = new Client({ node: `http://localhost:${(server.address() as AddressInfo).port}`, maxResponseSize: 100, Connection: GuardedUndiciConnection })
    const uncaught: Error[] = []
    const onUncaught = (err: Error) => { uncaught.push(err) }
    process.on('uncaughtException', onUncaught)
    try {
      await assert.rejects(client.search({ index: 'x' }), /bigger than the maximum allowed string/)
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.deepEqual(uncaught, [])

      // responses within the limit are read as usual
      const small = new Client({ node: `http://localhost:${(server.address() as AddressInfo).port}`, Connection: GuardedUndiciConnection })
      assert.deepEqual((await small.search({ index: 'x' })).hits.hits, [])
      await small.close()
    } finally {
      process.off('uncaughtException', onUncaught)
      await client.close()
      server.close()
    }
  })
})
