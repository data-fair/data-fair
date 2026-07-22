import { S3Client, CreateBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { IntegrityStore } from '../../api/src/integrity/store.ts'
import { getRawDataset } from './workers.ts'
import { apiUrl } from './axios.ts'

const endpoint = `http://localhost:${process.env.S3_PORT}`
const bucket = 'data-fair-integrity'
const credentials = { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' }

export const integrityTestClient = new S3Client({ region: 'us-east-1', endpoint, credentials, forcePathStyle: true })

// the real IntegrityStore, constructed with explicit MinIO options (no #config in the test process)
export const integrityTestStore = new IntegrityStore({ region: 'us-east-1', endpoint, bucket, credentials, forcePathStyle: true })

export const ensureIntegrityBucket = async (): Promise<void> => {
  try {
    await integrityTestClient.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }))
  } catch (err: any) {
    if (err.name !== 'BucketAlreadyOwnedByYou' && err.name !== 'BucketAlreadyExists') throw err
  }
}

export const listIntegrityKeys = async (prefix: string): Promise<string[]> => {
  const res = await integrityTestClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  return (res.Contents ?? []).map((o) => o.Key!).filter(Boolean)
}

// The historize relay is triggered by the `_needsHistorizing` flag, which the worker discovers
// on its periodic poll — so waitForWorkerIdle() can return before the task is even picked up.
// Poll the store until at least `expected` revisions exist (or timeout).
export const waitForIntegrityRevisions = async (prefix: string, expected: number, timeoutMs = 20000): Promise<string[]> => {
  const start = Date.now()
  let keys = await listIntegrityKeys(prefix)
  while (keys.length < expected && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    keys = await listIntegrityKeys(prefix)
  }
  return keys
}

export const revisionsPrefix = (dataset: any): string =>
  `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

// The per-line relay is driven by the dataset-level _needsHistorizingLines hint; wait for the
// hint to clear (all stamped lines shipped) before asserting on line anchors or running a check.
export const waitForLinesDrained = async (ax: any, datasetId: string, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${datasetId}`)).data
    if (!raw._needsHistorizingLines) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('timed out waiting for _needsHistorizingLines to clear')
}

// waitForIntegrityRevisions only confirms the S3 object exists; the relay may still be writing its
// trailing mongo update (integrity.lastRevision + unsetting _needsHistorizing). checkDataset treats
// a still-set _needsHistorizing as "pending" ('unknown'), so a check run in that window would race
// a real verdict — wait for the flag to clear too.
export const waitForFlagCleared = async (datasetId: string, timeoutMs = 20000): Promise<any> => {
  const start = Date.now()
  let raw = await getRawDataset(datasetId)
  while (raw._needsHistorizing !== undefined && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    raw = await getRawDataset(datasetId)
  }
  if (raw._needsHistorizing !== undefined) throw new Error('relay did not clear _needsHistorizing within timeout')
  return raw
}

// --- round 3 (trail coherence) attack helpers -------------------------------------------------

// Shadow a revision: PUT a new current version onto an existing key (object-lock protects the
// original version, not the key) — the store-credentialed rewrite attack.
export const putShadowVersion = async (key: string, body: any): Promise<void> => {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  await integrityTestClient.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(body), ContentType: 'application/json' }))
}

// Hide a key behind a delete marker (versionless DELETE) — the store-credentialed hide attack.
export const putDeleteMarker = async (key: string): Promise<void> => {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  await integrityTestClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
