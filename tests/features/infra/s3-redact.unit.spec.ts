import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { redactS3Config } from '../../../api/src/files-storage/operations.ts'

// The S3 client config is written to the debug logs on client creation. It carries the
// bucket credentials, which must never reach a log aggregator.

const fullConfig = {
  region: 'fr-par',
  endpoint: 'https://s3.fr-par.scw.cloud',
  bucket: 'data-fair',
  credentials: {
    accessKeyId: 'SCWXXXXXXXXXXXXXXXXX',
    secretAccessKey: 'super-secret-value'
  },
  forcePathStyle: true
}

test('redactS3Config hides the secret access key', () => {
  const redacted = redactS3Config(fullConfig)
  assert.equal(redacted?.credentials?.secretAccessKey, '[redacted]')
  assert.ok(!JSON.stringify(redacted).includes('super-secret-value'))
})

test('redactS3Config keeps the non-secret parts intact', () => {
  const redacted = redactS3Config(fullConfig)
  assert.equal(redacted?.region, 'fr-par')
  assert.equal(redacted?.endpoint, 'https://s3.fr-par.scw.cloud')
  assert.equal(redacted?.bucket, 'data-fair')
  assert.equal(redacted?.forcePathStyle, true)
  assert.equal(redacted?.credentials?.accessKeyId, 'SCWXXXXXXXXXXXXXXXXX')
})

test('redactS3Config does not mutate the source config', () => {
  redactS3Config(fullConfig)
  assert.equal(fullConfig.credentials.secretAccessKey, 'super-secret-value')
})

test('redactS3Config tolerates absent credentials', () => {
  assert.deepEqual(redactS3Config({ bucket: 'data-fair' }), { bucket: 'data-fair' })
  assert.deepEqual(redactS3Config({}), {})
})

test('redactS3Config does not invent a secret key that was not set', () => {
  const redacted = redactS3Config({ credentials: { accessKeyId: 'id-only' } })
  assert.deepEqual(redacted?.credentials, { accessKeyId: 'id-only' })
})
