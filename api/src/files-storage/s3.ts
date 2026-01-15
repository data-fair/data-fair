import config from '#config'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { FileStats, FileBackend } from './types.ts'
import { unlink } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { httpError } from '@data-fair/lib-express'

const bucketPath = (path: string) => path.replace(config.dataDir, '')

export class S3Backend implements FileBackend {
  private client: S3Client

  constructor () {
    this.client = new S3Client(config.s3)
  }

  async ls (prefix: string = ''): Promise<FileStats[]> {
    const command = new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: prefix })
    const response = await this.client.send(command)
    return (response.Contents || []).map((obj) => ({
      name: obj.Key!,
      size: obj.Size!,
      isDirectory: obj.Key!.endsWith('/'),
      lastModified: obj.LastModified!,
    }))
  }

  async rm (path: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: bucketPath(path) })
    await this.client.send(command)
  }

  async readStream (path: string, ifModifiedSince?: string) {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: bucketPath(path),
      IfModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined
    })

    try {
      const response = await this.client.send(command)
      return {
        lastModified: response.LastModified,
        size: response.ContentLength,
        body: response.Body as NodeJS.ReadableStream
      }
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 304) {
        throw httpError(304)
      }
      throw err
    }
  }

  async moveTmpFile (tmpPath: string, path: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: config.s3.bucket,
        Key: path,
        Body: createReadStream(tmpPath)
      }
    })
    await upload.done()
    await unlink(tmpPath)
  }
}
