import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectRetentionCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { Readable } from 'node:stream'
import type { RevisionContext } from './operations.ts'

export type RevisionBody = {
  hash: { md5?: string, sha256?: string }
  context: RevisionContext
  dataset: { id: string, slug?: string }
  // level 2: the full covered-metadata projection, and the descriptor of the sibling
  // `{key}.file` locked object when the revision carries a file copy
  payload?: { metadata: Record<string, any>, file?: { size: number } }
}

export type IntegrityS3Options = {
  region?: string
  endpoint: string
  bucket: string
  credentials: { accessKeyId: string, secretAccessKey: string }
  forcePathStyle?: boolean
}

export class IntegrityStore {
  client: S3Client
  bucket: string
  constructor (opts: IntegrityS3Options) {
    this.client = new S3Client({
      region: opts.region || 'us-east-1',
      endpoint: opts.endpoint,
      credentials: opts.credentials,
      forcePathStyle: opts.forcePathStyle ?? true
    })
    this.bucket = opts.bucket
  }

  async writeRevision (key: string, body: RevisionBody, retainUntil: Date): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(body),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: retainUntil
    }))
  }

  async listRevisions (prefix: string): Promise<{ key: string, lastModified?: Date }[]> {
    const revisions: { key: string, lastModified?: Date }[] = []
    let ContinuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }))
      for (const o of res.Contents ?? []) if (o.Key) revisions.push({ key: o.Key, lastModified: o.LastModified })
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken)
    return revisions
  }

  async getRevision (key: string): Promise<RevisionBody> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    const text = await res.Body!.transformToString()
    return JSON.parse(text)
  }

  // Push the compliance retain-until date forward in place (S3/MinIO allow increasing only;
  // a shorter date is rejected by the provider). This is architecture §3.4 Option B.
  async extendRetention (key: string, retainUntil: Date): Promise<void> {
    await this.client.send(new PutObjectRetentionCommand({
      Bucket: this.bucket,
      Key: key,
      Retention: { Mode: 'COMPLIANCE', RetainUntilDate: retainUntil }
    }))
  }

  async getRetention (key: string): Promise<Date | undefined> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
    return res.ObjectLockRetainUntilDate
  }

  // Level-2 file payload: a sibling `{revisionKey}.file` object under the same compliance
  // lock, streamed via multipart upload (files can be many GB).
  async writePayload (key: string, body: Readable, retainUntil: Date): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil
      }
    })
    await upload.done()
  }

  async readPayload (key: string): Promise<{ body: Readable, size?: number }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return { body: res.Body as Readable, size: res.ContentLength }
  }
}
