import config from '#config'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand, paginateListObjectsV2 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { FileStats, FileBackend } from './types.ts'
import { unlink } from 'node:fs/promises'
import { createReadStream, type ReadStream } from 'node:fs'
import { httpError } from '@data-fair/lib-express'
import unzipper from 'unzipper'

const bucketPath = (path: string) => path.replace(config.dataDir, '')

export class S3Backend implements FileBackend {
  private client: S3Client

  constructor () {
    this.client = new S3Client(config.s3)
  }

  async lsr (targetPath: string): Promise<string[]> {
    const files = await this.lsrWithStats(targetPath)
    return files.map(f => f.path)
  }

  async lsrWithStats (targetPath: string): Promise<FileStats[]> {
    const command = new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: bucketPath(targetPath) })
    const response = await this.client.send(command)
    return (response.Contents || []).map((obj) => ({
      path: obj.Key!.replace(targetPath, ''),
      size: obj.Size!,
      isDirectory: obj.Key!.endsWith('/'),
      lastModified: obj.LastModified!,
    }))
  }

  async rm (path: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: bucketPath(path) })
    await this.client.send(command)
  }

  async readStream (path: string, ifModifiedSince?: string, range?: string) {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: bucketPath(path),
      IfModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined,
      Range: range
    })

    try {
      const response = await this.client.send(command)
      return {
        lastModified: response.LastModified,
        size: response.ContentLength,
        body: response.Body as NodeJS.ReadableStream,
        range: response.ContentRange
      }
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 304) {
        throw httpError(304)
      }
      throw err
    }
  }

  async moveFromFs (tmpPath: string, path: string): Promise<void> {
    await this.writeStream(createReadStream(tmpPath), path)
    await unlink(tmpPath)
  }

  async writeStream (readStream: ReadStream, path: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: config.s3.bucket,
        Key: path,
        Body: readStream
      }
    })
    await upload.done()
  }

  async copyFile (srcPath: string, dstPath: string) {
    const params = {
      Bucket: config.s3.bucket,
      CopySource: `${config.s3.bucket}/${srcPath}`,
      Key: dstPath,
    }

    await this.client.send(new CopyObjectCommand(params))
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
      console.log(`Copied ${copyPromises.length} objects...`)
    }

    console.log('All matching objects copied.')
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
    return unzipper.Open.s3(this.client, { Bucket: config.s3.bucket, Key: bucketPath(path) })
  }
}
