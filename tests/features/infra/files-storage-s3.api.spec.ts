import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// The S3 files-storage backend, exercised against the dev MinIO (same convention as
// s3-multipart-copy.api.spec.ts: skipped when no S3 service is reachable).
//
// Context: on S3, `pathExists` is a ListObjectsV2 Prefix match while the fs backend
// checks the exact path. A dataset attachment value that is a strict prefix of a stored
// file (e.g. `03kp0009` vs `03kp0009.jpg`) passes the existence check and then crashes
// on the exact-key HeadObject of `fileStats` — whose 404 has no response body, so the
// AWS SDK surfaces the literal message "UnknownError" all the way to the dataset journal.
// These tests pin the intended semantics: a new exact-match `fileExists` for files,
// prefix semantics kept on `pathExists` for directories, and S3 errors mapped to
// meaningful http errors at the backend boundary.

const s3Port = process.env.S3_PORT
const s3Options = {
  region: 'us-east-1',
  endpoint: `http://localhost:${s3Port}`,
  bucket: 'bucketdev',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin'
  },
  forcePathStyle: true
}
const dataDir = resolve('../data/development')
const base = `${dataDir}/test-files-storage-s3`
const storedKey = 'test-files-storage-s3/attachments/03kp0009.jpg'

test.describe('S3 files-storage backend', () => {
  let backend: any
  let rawClient: S3Client

  test.beforeAll(async () => {
    if (!s3Port) {
      test.skip()
      return
    }
    rawClient = new S3Client({
      region: s3Options.region,
      endpoint: s3Options.endpoint,
      credentials: s3Options.credentials,
      forcePathStyle: s3Options.forcePathStyle
    })
    try {
      await rawClient.send(new PutObjectCommand({ Bucket: s3Options.bucket, Key: storedKey, Body: 'fake jpg content' }))
    } catch {
      test.skip()
      return
    }
    // the backend must be constructible with explicit options (IntegrityStore pattern),
    // without loading #config in the test process
    const { S3Backend } = await import('../../../api/src/files-storage/s3.ts')
    backend = new S3Backend({ ...s3Options, dataDir })
  })

  test.afterAll(async () => {
    if (!s3Port) return
    await rawClient.send(new DeleteObjectCommand({ Bucket: s3Options.bucket, Key: storedKey }))
  })

  test('fileExists requires an exact key match', async () => {
    assert.equal(await backend.fileExists(`${base}/attachments/03kp0009.jpg`), true)
    // a strict prefix of an existing key is NOT an existing file
    assert.equal(await backend.fileExists(`${base}/attachments/03kp0009`), false)
    // a directory prefix is not a file either
    assert.equal(await backend.fileExists(`${base}/attachments`), false)
  })

  test('pathExists keeps prefix semantics for directories', async () => {
    assert.equal(await backend.pathExists(`${base}/attachments`), true)
    assert.equal(await backend.pathExists(`${base}/nowhere`), false)
  })

  test('fileStats on a missing key throws a mapped 404, not "UnknownError"', async () => {
    await assert.rejects(backend.fileStats(`${base}/attachments/03kp0009`), (err: any) => {
      assert.equal(err.status, 404)
      assert.match(err.message, /file not found/)
      return true
    })
  })
})
