import { test, expect } from '@playwright/test'
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3'
import { ensureIntegrityBucket, integrityTestClient, integrityTestStore, listIntegrityKeys } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })

// MinIO enables versioning on object-lock buckets, so a plain DELETE adds a delete-marker and a plain
// PUT adds a new version rather than throwing. The WORM guarantee under test is that the *locked
// version's bytes cannot be destroyed within retention*: hard-deleting that specific version is
// rejected and its bytes remain readable. These helpers read the original locked version directly.
const originalVersionId = async (key: string): Promise<string> => {
  const res = await integrityTestClient.send(new ListObjectVersionsCommand({ Bucket: 'data-fair-integrity', Prefix: key }))
  const version = (res.Versions ?? []).find((v) => v.Key === key)
  if (!version?.VersionId) throw new Error(`no version found for ${key}`)
  return version.VersionId
}
const readVersion = async (key: string, versionId: string) => {
  const res = await integrityTestClient.send(new GetObjectCommand({ Bucket: 'data-fair-integrity', Key: key, VersionId: versionId }))
  return JSON.parse(await res.Body!.transformToString())
}

test('writeRevision stores a compliance-locked object that can be read back and listed', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store/${Date.now()}/000000000`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  await store.writeRevision(key, {
    hash: { md5: 'abc123' },
    context: { operation: 'create', originator: 'test', date: new Date().toISOString() },
    dataset: { id: 'ds-store', slug: 'ds-store' }
  }, retainUntil)

  const back = await store.getRevision(key)
  expect(back.hash.md5).toBe('abc123')
  const keys = await listIntegrityKeys('data-fair/test-store/')
  expect(keys).toContain(key)
})

test('a written revision is WORM: the locked version cannot be destroyed within retention', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-worm/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'worm' },
    context: { operation: 'create', originator: 'test', date: new Date().toISOString() },
    dataset: { id: 'ds-worm' }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const versionId = await originalVersionId(key)

  // A versioned hard-delete of the locked version must be rejected by COMPLIANCE object lock.
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key, VersionId: versionId })))
    .rejects.toThrow()
  // ...and the locked bytes remain readable and intact.
  const back = await readVersion(key, versionId)
  expect(back.hash.md5).toBe('worm')
})

test('overwriting a locked key never replaces the locked version: the original is retained', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-ow/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'v1' },
    context: { operation: 'create', originator: 'test', date: new Date().toISOString() },
    dataset: { id: 'ds-ow' }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const versionId = await originalVersionId(key)

  // A plain PUT without a lock header creates a new version on the versioned bucket; it must NOT
  // replace the locked version's bytes.
  await integrityTestClient.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: 'tampered' }))
  // The original locked version is still readable and unchanged.
  const back = await readVersion(key, versionId)
  expect(back.hash.md5).toBe('v1')
  // And that locked version still cannot be destroyed.
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key, VersionId: versionId })))
    .rejects.toThrow()
})
