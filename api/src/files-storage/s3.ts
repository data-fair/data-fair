import type { ApiConfig } from '../../config/type/index.ts'
import { relative as relativePath, resolve as resolvePath, join as joinPath } from 'node:path'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, paginateListObjectsV2, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCopyCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, type S3ClientConfig } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { FileStats, FileBackend } from './types.ts'
import { unlink } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { type Readable } from 'node:stream'
import { httpError } from '@data-fair/lib-express'
import unzipper from 'unzipper'
import debugModule from 'debug'
import { S3ReadStream } from 's3-readstream'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { HttpAgent, HttpsAgent } from 'agentkeepalive'
import { retryOnMissing } from './s3-retry.ts'
import { redactS3Config } from './operations.ts'

const debug = debugModule('s3')

// explicit options instead of #config so the backend can be constructed in the test
// process against MinIO (same pattern as IntegrityStore)
export type S3BackendOptions = ApiConfig['s3'] & { bucket: string, dataDir: string }

export class S3Backend implements FileBackend {
  private dataClient: S3Client
  private metadataClient: S3Client
  private options: S3BackendOptions
  private bucket: string
  private dataDir: string

  constructor (options: S3BackendOptions) {
    debug('create client', redactS3Config(options))
    this.options = options
    this.bucket = options.bucket
    this.dataDir = resolvePath(options.dataDir)
    // Customizing the handler for high throughput
    // and splitting data and metadata client so that long running queries do not block short metadata queries
    // TODO: monitor the sockets like we do in @data-fair/lib-node/http-agents ?
    this.dataClient = new S3Client({
      ...options as S3ClientConfig,
      requestHandler: new NodeHttpHandler({
        httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50, timeout: 60000 }),
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50, timeout: 60000 }),
      }),
    })
    this.metadataClient = new S3Client({
      ...options as S3ClientConfig,
      // Customizing the handler for high throughput
      requestHandler: new NodeHttpHandler({
        httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50 }),
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50 }),
      }),
    })
  }

  private bucketPath (path: string) {
    if (path === this.dataDir) return ''
    return path.replace(this.dataDir + '/', '')
  }

  async checkAccess () {
    debug('check access')
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: 'check-access.txt', Body: 'ok' })
    debug('access ok')
    await this.metadataClient.send(command, { requestTimeout: 10000 })
  }

  async lsr (targetPath: string): Promise<string[]> {
    debug('lrs', targetPath)
    const files = await this.lsrWithStats(targetPath)
    debug(' -> ', files)
    return files.map(f => f.path)
  }

  async lsrWithStats (targetPath: string): Promise<FileStats[]> {
    debug('lrsWithStats', targetPath, this.bucketPath(targetPath))
    const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.bucketPath(targetPath) })
    const response = await this.metadataClient.send(command)
    const filesStats = (response.Contents || []).map((obj) => ({
      path: relativePath(targetPath, joinPath(this.dataDir, obj.Key!)),
      size: obj.Size!,
      lastModified: obj.LastModified!,
    }))
    debug(' -> ', filesStats)
    return filesStats
  }

  async fileStats (path: string) {
    const command = new HeadObjectCommand({ Bucket: this.bucket, Key: this.bucketPath(path) })
    try {
      const response = await this.metadataClient.send(command)
      return { size: response.ContentLength!, lastModified: response.LastModified! }
    } catch (err: any) {
      // a HEAD 404 response has no body for the SDK to parse, so the raw error carries the
      // meaningless message "UnknownError"; map it before it can reach a journal or a client
      if (err.$metadata?.httpStatusCode === 404) throw httpError(404, 'file not found')
      throw err
    }
  }

  async removeFile (path: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: this.bucketPath(path) })
    await this.metadataClient.send(command)
  }

  async removeDir (path: string): Promise<void> {
    // the page size cannot be too large as it is also the number of parallel deletes
    const pages = paginateListObjectsV2(
      { client: this.metadataClient, pageSize: 100 },
      { Bucket: this.bucket, Prefix: this.bucketPath(path) }
    )

    for await (const page of pages) {
      if (!page.Contents) continue

      // Map each object in the current page to a Delete promise
      const deletePromises = page.Contents.map((obj) => {
        const deleteParams = { Bucket: this.bucket, Key: obj.Key, }
        return this.metadataClient.send(new DeleteObjectCommand(deleteParams))
      })

      // Execute the batch of deletes for this page
      await Promise.all(deletePromises)
    }
  }

  async readStream (path: string, ifModifiedSince?: string, range?: string, slow?: boolean, retryMissing?: boolean) {
    debug('readStream', path)
    const ifModifiedSinceDate = ifModifiedSince ? new Date(ifModifiedSince) : undefined

    const bucketParams = { Bucket: this.bucket, Key: this.bucketPath(path), IfModifiedSince: ifModifiedSinceDate, }
    try {
      // retryMissing is set by callers that just wrote the file and so expect it to exist;
      // it absorbs read-after-write inconsistency on some S3 providers. It must stay off for
      // client-facing reads where a 404 is a normal, must-stay-fast response.
      const headObject = retryMissing
        ? await retryOnMissing(() => this.dataClient.send(new HeadObjectCommand(bucketParams)))
        : await this.dataClient.send(new HeadObjectCommand(bucketParams))

      // this shouldn't happen except if the s3 provider does not support conditional header
      if (ifModifiedSinceDate && Math.floor(headObject.LastModified!.getTime() / 1000) <= Math.floor(ifModifiedSinceDate.getTime() / 1000)) {
        throw httpError(304)
      }

      const s3ChunkSize = 1 * 1024 * 1024
      if (!slow || range || headObject.ContentLength! < (s3ChunkSize)) {
        // simpler mono-request mode
        const response = await this.dataClient.send(new GetObjectCommand({ ...bucketParams, Range: range }))
        debug('readStream simple mode ok', response)
        const stream = response.Body as Readable
        // this error will also be thrown on the stream consumer, but the stacktrace can be very generic
        stream.on('error', (err) => { console.error('s3 readStream error in simple mode', err) })
        // 1Mb chunks seems like a good compromise between memory consumption and number of requests
        return {
          lastModified: response.LastModified!,
          size: response.ContentLength!,
          body: stream,
          range: response.ContentRange
        }
      } else {
        // the chunked mode prevents long running http requests that can endup being aborted, for example during indexing of large dataset
        const stream = new S3ReadStream({
          s3: this.dataClient,
          command: new GetObjectCommand(bucketParams),
          maxLength: headObject.ContentLength!,
          byteRange: s3ChunkSize
        })
        // this error will also be thrown on the stream consumer, but the stacktrace can be very generic
        stream.on('error', (err) => { console.error('s3 readStream error in chunked mode', err) })
        debug('readStream chunked mode')
        return {
          lastModified: headObject.LastModified!,
          size: headObject.ContentLength!,
          body: stream
        }
      }
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 304) {
        debug('readStream no change 304')
        throw httpError(304)
      }
      debug('readStream error', err)
      if (err.$metadata?.httpStatusCode === 404) {
        throw httpError(404, 'file not found')
      }
      throw err
    }
  }

  async moveFromFs (tmpPath: string, path: string): Promise<void> {
    await this.writeStream(createReadStream(tmpPath), path)
    // Confirm the object is actually readable before deleting the local source. Some S3
    // providers can ack a write without durably storing the object, which then surfaces as
    // a NoSuchKey when a worker reads the file in another process. Verifying here (like the
    // multer upload path does with fileStats) turns that silent miss into a loud failure at
    // upload time instead. retryOnMissing absorbs the transient cross-connection
    // inconsistency (we write on dataClient and HEAD on metadataClient) so only a persistent
    // miss — the durable loss we actually want to catch — fails the upload.
    await retryOnMissing(() => this.metadataClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.bucketPath(path) })))
    await unlink(tmpPath)
  }

  async writeStream (readStream: Readable, path: string): Promise<void> {
    const upload = new Upload({
      client: this.dataClient,
      params: {
        Bucket: this.bucket,
        Key: this.bucketPath(path),
        Body: readStream
      }
    })
    await upload.done()
  }

  async writeString (path: string, content: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: this.bucketPath(path), Body: content })
    await this.dataClient.send(command)
  }

  async copyFile (srcPath: string, dstPath: string) {
    const srcKey = this.bucketPath(srcPath)
    const dstKey = this.bucketPath(dstPath)

    const headResp = await this.metadataClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: srcKey }))
    const fileSize = headResp.ContentLength!

    const maxSingleCopySize = this.options.maxSingleCopySize || 5 * 1024 * 1024 * 1024

    if (fileSize < maxSingleCopySize) {
      await this.dataClient.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURI(srcKey)}`,
        Key: dstKey,
      }))
      return
    }

    const multipartChunkSize = this.options.multipartChunkSize || 100 * 1024 * 1024
    const totalParts = Math.ceil(fileSize / multipartChunkSize)

    const createResp = await this.dataClient.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: dstKey,
    }))
    const uploadId = createResp.UploadId!

    try {
      const copyParts = []
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * multipartChunkSize
        const end = Math.min(partNumber * multipartChunkSize, fileSize) - 1

        const copyPart = this.dataClient.send(new UploadPartCopyCommand({
          Bucket: this.bucket,
          Key: dstKey,
          CopySource: `${this.bucket}/${encodeURI(srcKey)}`,
          CopySourceRange: `bytes=${start}-${end}`,
          UploadId: uploadId,
          PartNumber: partNumber,
        }))
        copyParts.push(copyPart)
      }

      const responses = await Promise.all(copyParts)

      await this.dataClient.send(new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: dstKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: responses.map((r, i) => ({
            ETag: r.CopyPartResult!.ETag,
            PartNumber: i + 1,
          })),
        },
      }))
    } catch (err) {
      await this.dataClient.send(new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: dstKey,
        UploadId: uploadId,
      }))
      throw err
    }
  }

  async moveFile (srcPath: string, dstPath: string) {
    await this.copyFile(srcPath, dstPath)
    await this.removeFile(srcPath)
  }

  async copyDir (srcPath: string, dstPath: string) {
    // the page size cannot be too large as it is also the number of parallel copies
    const pages = paginateListObjectsV2(
      { client: this.dataClient, pageSize: 100 },
      { Bucket: this.bucket, Prefix: this.bucketPath(srcPath) }
    )

    for await (const page of pages) {
      if (!page.Contents) continue

      // Map each object in the current page to a Copy promise
      const copyPromises = page.Contents.map((obj) => {
        const sourceKey = obj.Key!
        const destKey = sourceKey.replace(this.bucketPath(srcPath), this.bucketPath(dstPath))
        return this.copyFile(
          joinPath(this.dataDir, sourceKey),
          joinPath(this.dataDir, destKey)
        )
      })

      // Execute the batch of copies for this page
      await Promise.all(copyPromises)
    }
  }

  async moveDir (srcPath: string, dstPath: string) {
    await this.copyDir(srcPath, dstPath)
    await this.removeDir(srcPath)
  }

  async pathExists (path: string) {
    // prefix semantics: matches a "directory" (S3 has none, only key prefixes) as well as a
    // file — use fileExists for files, a strict prefix of an existing key would match here
    const params = {
      Bucket: this.bucket,
      Prefix: this.bucketPath(path),
      MaxKeys: 1, // We only need to know if at least one exists
    }
    const response = await this.metadataClient.send(new ListObjectsV2Command(params))
    return !!(response.Contents && response.Contents.length > 0)
  }

  async fileExists (path: string) {
    try {
      await this.metadataClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.bucketPath(path) }))
      return true
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 404) return false
      throw err
    }
  }

  async zipDirectory (path: string) {
    return unzipper.Open.s3_v3(this.dataClient, { Bucket: this.bucket, Key: this.bucketPath(path) })
  }

  async fileSample (path: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.bucketPath(path),
      Range: 'bytes=0-' + (1024 * 1024)
    })
    // fileSample is only ever called right after the file was written (storer / csv analysis),
    // so retry transient NoSuchKey caused by read-after-write inconsistency on some S3 providers.
    const response = await retryOnMissing(() => this.dataClient.send(command))
    return Buffer.from(await response.Body!.transformToByteArray())
  }
}
