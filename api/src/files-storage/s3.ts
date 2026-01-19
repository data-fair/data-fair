import config from '#config'
import { relative as relativePath, resolve as resolvePath, join as joinPath } from 'node:path'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, paginateListObjectsV2, PutObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { FileStats, FileBackend } from './types.ts'
import { unlink } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { type Readable } from 'node:stream'
import { httpError } from '@data-fair/lib-express'
import unzipper from 'unzipper'
import debugModule from 'debug'

const debug = debugModule('s3')

export const dataDir = resolvePath(config.dataDir)

const bucketPath = (path: string) => path.replace(dataDir + '/', '')

export class S3Backend implements FileBackend {
  private client: S3Client

  constructor () {
    debug('create client', config.s3)
    this.client = new S3Client(config.s3)
  }

  async checkAccess () {
    debug('check access')
    const command = new PutObjectCommand({ Bucket: config.s3.bucket, Key: 'check-access.txt', Body: 'ok' })
    debug('access ok')
    await this.client.send(command)
  }

  async lsr (targetPath: string): Promise<string[]> {
    debug('lrs', targetPath)
    const files = await this.lsrWithStats(targetPath)
    debug(' -> ', files)
    return files.map(f => f.path)
  }

  async lsrWithStats (targetPath: string): Promise<FileStats[]> {
    debug('lrsWithStats', targetPath, bucketPath(targetPath))
    const command = new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: bucketPath(targetPath) })
    const response = await this.client.send(command)
    const filesStats = (response.Contents || []).map((obj) => ({
      path: relativePath(targetPath, joinPath(dataDir, obj.Key!)),
      size: obj.Size!,
      lastModified: obj.LastModified!,
    }))
    debug(' -> ', filesStats)
    return filesStats
  }

  async fileStats (path: string) {
    const command = new HeadObjectCommand({ Bucket: config.s3.bucket, Key: bucketPath(path) })
    const response = await this.client.send(command)
    return { size: response.ContentLength!, lastModified: response.LastModified! }
  }

  async removeFile (path: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: bucketPath(path) })
    await this.client.send(command)
  }

  async removeDir (path: string): Promise<void> {
    // the page size cannot be too large as it is also the number of parallel copies
    const pages = paginateListObjectsV2(
      { client: this.client, pageSize: 100 },
      { Bucket: config.s3.bucket, Prefix: bucketPath(path) }
    )

    for await (const page of pages) {
      if (!page.Contents) continue

      // Map each object in the current page to a Copy promise
      const deletePromises = page.Contents.map((obj) => {
        const deleteParams = { Bucket: config.s3.bucket, Key: obj.Key, }
        return this.client.send(new DeleteObjectCommand(deleteParams))
      })

      // Execute the batch of copies for this page
      await Promise.all(deletePromises)
    }
  }

  async readStream (path: string, ifModifiedSince?: string, range?: string) {
    debug('readStream', path)
    const ifModifiedSinceDate = ifModifiedSince ? new Date(ifModifiedSince) : undefined
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: bucketPath(path),
      IfModifiedSince: ifModifiedSinceDate,
      Range: range
    })

    try {
      const response = await this.client.send(command)

      // this shouldn't happen except if the s3 provider does not support conditional header
      if (ifModifiedSinceDate && Math.floor(response.LastModified!.getTime() / 1000) <= Math.floor(ifModifiedSinceDate.getTime() / 1000)) {
        throw httpError(304)
      }

      return {
        lastModified: response.LastModified!,
        size: response.ContentLength!,
        body: response.Body as Readable,
        range: response.ContentRange
      }
      debug('readStream ok', response)
    } catch (err: any) {
      debug('readStream error', err)
      if (err.$metadata?.httpStatusCode === 304) {
        throw httpError(304)
      }
      if (err.$metadata?.httpStatusCode === 404) {
        throw httpError(404, 'file not found')
      }
      throw err
    }
  }

  async moveFromFs (tmpPath: string, path: string): Promise<void> {
    await this.writeStream(createReadStream(tmpPath), path)
    await unlink(tmpPath)
  }

  async writeStream (readStream: Readable, path: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: config.s3.bucket,
        Key: bucketPath(path),
        Body: readStream
      }
    })
    await upload.done()
  }

  async writeString (path: string, content: string) {
    const command = new PutObjectCommand({ Bucket: config.s3.bucket, Key: bucketPath(path), Body: content })
    await this.client.send(command)
  }

  async copyFile (srcPath: string, dstPath: string) {
    const params = {
      Bucket: config.s3.bucket,
      CopySource: `${config.s3.bucket}/${bucketPath(srcPath)}`,
      Key: bucketPath(dstPath),
    }

    await this.client.send(new CopyObjectCommand(params))
  }

  async moveFile (srcPath: string, dstPath: string) {
    await this.copyFile(srcPath, dstPath)
    await this.removeFile(srcPath)
  }

  async copyDir (srcPath: string, dstPath: string) {
    // the page size cannot be too large as it is also the number of parallel copies
    const pages = paginateListObjectsV2(
      { client: this.client, pageSize: 100 },
      { Bucket: config.s3.bucket, Prefix: bucketPath(srcPath) }
    )

    for await (const page of pages) {
      if (!page.Contents) continue

      // Map each object in the current page to a Copy promise
      const copyPromises = page.Contents.map((obj) => {
        const sourceKey = obj.Key
        // Replace the old prefix with the new prefix for the destination
        const copyParams = {
          Bucket: config.s3.bucket,
          CopySource: `${config.s3.bucket}/${sourceKey}`,
          Key: sourceKey!.replace(bucketPath(srcPath), bucketPath(dstPath)),
        }

        return this.client.send(new CopyObjectCommand(copyParams))
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
    const params = {
      Bucket: config.s3.bucket,
      Prefix: bucketPath(path),
      MaxKeys: 1, // We only need to know if at least one exists
    }
    const response = await this.client.send(new ListObjectsV2Command(params))
    return !!(response.Contents && response.Contents.length > 0)
  }

  async zipDirectory (path: string) {
    return unzipper.Open.s3_v3(this.client, { Bucket: config.s3.bucket, Key: bucketPath(path) })
  }

  async fileSample (path: string) {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: bucketPath(path),
      Range: 'bytes=0-' + (1024 * 1024)
    })
    const response = await this.client.send(command)
    return Buffer.from(await response.Body!.transformToByteArray())
  }
}
