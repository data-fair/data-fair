import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, ListObjectVersionsCommand, DeleteObjectCommand, PutObjectRetentionCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { Readable } from 'node:stream'
import type { RevisionContext } from './operations.ts'

export type RevisionBody = {
  // both sha256-hex: `file` digests the stored file's bytes (absent on file-less datasets),
  // `metadata` digests the covered-metadata projection (stable-key-sorted JSON)
  hash: { file?: string, metadata?: string }
  context: RevisionContext
  dataset: { id: string, slug?: string }
  // level 2: the full covered-metadata projection, and the descriptor of the file payload the
  // revision carries. `file.i` is the index of the revision whose `{i}.file` object OWNS the bytes
  // (payload reference dedupe): a metadata-only revision references an earlier copy instead of
  // uploading a duplicate. An ABSENT `i` means "own index" — the bytes live at this revision's own
  // `{i}.file` sibling. References always collapse to the owning revision (never chain).
  payload?: { metadata: Record<string, any>, file?: { size: number, i?: number } }
}

// Target 3 (per-line revisions): the revision of a single editable-dataset line. `payload` is the
// cleaned user body (no `_`-prefixed fields — no identities, no extension outputs); absent on
// tombstones. The content sha256 is ALSO embedded in the S3 key so checks work from LIST alone.
export type LineRevisionBody = {
  hash: { sha256?: string }
  context: RevisionContext
  dataset: { id: string, slug?: string }
  line: { _id: string, _i: number, _updatedAt?: string, deleted?: boolean }
  payload?: Record<string, any>
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

  async writeRevision (key: string, body: RevisionBody | LineRevisionBody, retainUntil: Date): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(body),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: retainUntil
    }))
  }

  // Paged variant of listRevisions: yields one LIST page (≤1000 keys, lexical order) at a time so
  // callers can fold over an arbitrarily large prefix without materializing every key in memory
  // (the checker's lines compare folds pages into an O(live-lines) latest-anchor map).
  async * iterateRevisionPages (prefix: string, opts?: { delimiter?: string }): AsyncGenerator<{ key: string, lastModified?: Date }[]> {
    let ContinuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, Delimiter: opts?.delimiter, ContinuationToken
      }))
      const page: { key: string, lastModified?: Date }[] = []
      for (const o of res.Contents ?? []) if (o.Key) page.push({ key: o.Key, lastModified: o.LastModified })
      if (page.length) yield page
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken)
  }

  // The sub-prefixes directly under `prefix` (S3 CommonPrefixes), without listing their contents.
  // This is what lets the purge enumerate dataset scopes at O(datasets) cost instead of walking
  // every object: LIST has no date predicate, so the only way to avoid a full walk is to not ask
  // for the objects in the first place.
  async listSubPrefixes (prefix: string): Promise<string[]> {
    const prefixes: string[] = []
    let ContinuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, Delimiter: '/', ContinuationToken
      }))
      for (const p of res.CommonPrefixes ?? []) if (p.Prefix) prefixes.push(p.Prefix)
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken)
    return prefixes
  }

  async listRevisions (prefix: string, opts?: { delimiter?: string }): Promise<{ key: string, lastModified?: Date }[]> {
    const revisions: { key: string, lastModified?: Date }[] = []
    for await (const page of this.iterateRevisionPages(prefix, opts)) revisions.push(...page)
    return revisions
  }

  // The store bucket is versioned (object-lock requires it): a retried same-key PUT stacks a
  // noncurrent version, and full erasure means deleting versions, not keys. Yields one page of
  // versions (and stray delete markers) at a time, keys in lexical order — the purge worker's
  // walk (see purge.ts).
  async * iterateVersionPages (prefix: string): AsyncGenerator<Array<{ key: string, versionId?: string, isLatest?: boolean, lastModified?: Date, deleteMarker?: boolean, size?: number, etag?: string }>> {
    let KeyMarker: string | undefined
    let VersionIdMarker: string | undefined
    do {
      const res = await this.client.send(new ListObjectVersionsCommand({
        Bucket: this.bucket, Prefix: prefix, KeyMarker, VersionIdMarker
      }))
      const page: Array<{ key: string, versionId?: string, isLatest?: boolean, lastModified?: Date, deleteMarker?: boolean, size?: number, etag?: string }> = []
      for (const v of res.Versions ?? []) {
        if (v.Key) page.push({ key: v.Key, versionId: v.VersionId, isLatest: v.IsLatest, lastModified: v.LastModified, size: v.Size, etag: v.ETag })
      }
      for (const m of res.DeleteMarkers ?? []) {
        if (m.Key) page.push({ key: m.Key, versionId: m.VersionId, isLatest: m.IsLatest, lastModified: m.LastModified, deleteMarker: true })
      }
      // the response splits versions and delete markers into two arrays, each key-ordered on its
      // own; re-sort so a page is lexically ordered as a whole and every key's entries are
      // adjacent — callers group contiguous keys (see purge.ts) and rely on that. sort() is
      // stable (ES2019), so within a key the provider's newest-first version order is preserved —
      // the trail fold (operations.ts) relies on exactly that to pick the current version
      page.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      if (page.length) yield page
      KeyMarker = res.IsTruncated ? res.NextKeyMarker : undefined
      VersionIdMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined
    } while (KeyMarker !== undefined || VersionIdMarker !== undefined)
  }

  // Delete one specific version. On a compliance-locked version the provider refuses (AccessDenied)
  // — the purge worker relies on exactly that refusal as its source of truth for "still protected".
  async deleteVersion (key: string, versionId?: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }))
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

  // The authoritative protection horizon of a stored object: whatever the lock actually says,
  // whether it was set at write or pushed forward by a renewal/reference extension. Reading it is
  // how the purge decides what has genuinely lapsed (never by attempting a delete and reading the
  // provider's refusal). `versionId` targets one specific version.
  async getRetention (key: string, versionId?: string): Promise<Date | undefined> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }))
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
