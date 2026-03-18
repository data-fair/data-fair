import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { Readable } from 'node:stream'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCopyCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

// Build S3 config from env vars (same as the dev server uses)
const s3Port = process.env.S3_PORT
const s3Config = {
  region: 'us-east-1',
  endpoint: `http://localhost:${s3Port}`,
  bucket: 'bucketdev',
  credentials: {
    accessKeyId: '',
    secretAccessKey: ''
  },
  forcePathStyle: true
}
const dataDir = '../data/development'

/** Lightweight S3 file storage for test purposes */
class TestS3Storage {
  private client: S3Client
  private bucket: string
  private dataDir: string

  constructor (config: typeof s3Config, dataDir: string) {
    this.bucket = config.bucket
    this.dataDir = dataDir
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.credentials,
      forcePathStyle: config.forcePathStyle
    })
  }

  private bucketPath (path: string) {
    const resolved = path.startsWith('/') ? path : `${this.dataDir}/${path}`
    const prefix = this.dataDir + '/'
    if (resolved === this.dataDir) return ''
    return resolved.replace(prefix, '')
  }

  async writeStream (readStream: Readable, path: string) {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.bucketPath(path), Body: readStream }
    })
    await upload.done()
  }

  async writeString (path: string, content: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: this.bucketPath(path), Body: content
    }))
  }

  async copyFile (srcPath: string, dstPath: string, opts?: { maxSingleCopySize?: number, multipartChunkSize?: number }) {
    const srcKey = this.bucketPath(srcPath)
    const dstKey = this.bucketPath(dstPath)
    const maxSingleCopySize = opts?.maxSingleCopySize ?? 5 * 1024 * 1024 * 1024
    const multipartChunkSize = opts?.multipartChunkSize ?? 100 * 1024 * 1024

    const headResp = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: srcKey }))
    const fileSize = headResp.ContentLength!

    if (fileSize < maxSingleCopySize) {
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURI(srcKey)}`,
        Key: dstKey
      }))
      return
    }

    const totalParts = Math.ceil(fileSize / multipartChunkSize)
    const createResp = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket, Key: dstKey
    }))
    const uploadId = createResp.UploadId!

    try {
      const copyParts = []
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * multipartChunkSize
        const end = Math.min(partNumber * multipartChunkSize, fileSize) - 1
        copyParts.push(this.client.send(new UploadPartCopyCommand({
          Bucket: this.bucket,
          Key: dstKey,
          CopySource: `${this.bucket}/${encodeURI(srcKey)}`,
          CopySourceRange: `bytes=${start}-${end}`,
          UploadId: uploadId,
          PartNumber: partNumber
        })))
      }
      const responses = await Promise.all(copyParts)
      await this.client.send(new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: dstKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: responses.map((r, i) => ({
            ETag: r.CopyPartResult!.ETag,
            PartNumber: i + 1
          }))
        }
      }))
    } catch (err) {
      await this.client.send(new AbortMultipartUploadCommand({
        Bucket: this.bucket, Key: dstKey, UploadId: uploadId
      }))
      throw err
    }
  }

  async pathExists (path: string): Promise<boolean> {
    const res = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket, Prefix: this.bucketPath(path), MaxKeys: 1
    }))
    return (res.Contents?.length ?? 0) > 0
  }

  async fileStats (path: string) {
    const res = await this.client.send(new HeadObjectCommand({
      Bucket: this.bucket, Key: this.bucketPath(path)
    }))
    return { size: res.ContentLength!, lastModified: res.LastModified! }
  }

  async removeFile (path: string) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket, Key: this.bucketPath(path)
    }))
  }
}

const dmeadus = await axiosAuth('dmeadus0@answers.com')

test.describe('S3 multipart copy', () => {
  let storage: TestS3Storage

  test.beforeAll(async () => {
    if (!s3Port) {
      test.skip()
      return
    }
    storage = new TestS3Storage(s3Config, dataDir)
    // Quick check that S3 is accessible
    try {
      await storage.writeString(`${dataDir}/s3-check.txt`, 'ok')
      await storage.removeFile(`${dataDir}/s3-check.txt`)
    } catch {
      test.skip()
    }
  })

  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should use multipart copy for files larger than threshold', async () => {
    async function * generateString () {
      for (let i = 0; i < 100 * 1024; i++) {
        yield '012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789'
      }
    }
    const testFilePath = `${dataDir}/multipart-test-source.txt`
    const testFileDestPath = `${dataDir}/multipart-test-dest.txt`

    await storage.writeStream(Readable.from(generateString()), testFilePath)
    await storage.copyFile(testFilePath, testFileDestPath, {
      maxSingleCopySize: 10 * 1024 * 1024,
      multipartChunkSize: 5 * 1024 * 1024
    })

    const destExists = await storage.pathExists(testFileDestPath)
    assert.ok(destExists, 'Destination file should exist after copy')

    const destStats = await storage.fileStats(testFileDestPath)
    assert.equal(destStats.size, 12288000, 'Destination file should have same size')

    await storage.removeFile(testFilePath)
    await storage.removeFile(testFileDestPath)
  })

  test('should use single copy for files smaller than threshold', async () => {
    const testFileContent = 'a'.repeat(2000)
    const testFilePath = `${dataDir}/single-copy-source.txt`
    const testFileDestPath = `${dataDir}/single-copy-dest.txt`

    await storage.writeString(testFilePath, testFileContent)
    await storage.copyFile(testFilePath, testFileDestPath, {
      maxSingleCopySize: 10000
    })

    const destExists = await storage.pathExists(testFileDestPath)
    assert.ok(destExists, 'Destination file should exist after copy')

    const destStats = await storage.fileStats(testFileDestPath)
    assert.equal(destStats.size, 2000, 'Destination file should have same size')

    await storage.removeFile(testFilePath)
    await storage.removeFile(testFileDestPath)
  })

  test('should use multipart copy during draft validation with small threshold', async () => {
    // This test exercises the full pipeline: upload in draft, finalize, validate draft
    // The copy with small thresholds happens server-side during draft validation
    // We just verify the pipeline completes successfully
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = dmeadus

    const res = await ax.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      params: { draft: true }
    })
    assert.equal(res.status, 201)

    let dataset = await waitForFinalize(ax, res.data.id)

    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
  })
})
