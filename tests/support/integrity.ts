import { S3Client, CreateBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { IntegrityStore } from '../../api/src/integrity/store.ts'
import { getRawDataset } from './workers.ts'

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

// waitForIntegrityRevisions only confirms one class's S3 object exists; the relay may still be
// processing the other class (a single trailing mongo update unsets _needsHistorizing only once
// BOTH classes are done). checkDataset treats a still-set _needsHistorizing as "pending" ('unknown'),
// so a check run in that window would race a real verdict — wait for the flag to clear too.
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
