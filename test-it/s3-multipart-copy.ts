import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders } from './utils/index.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import config from '../api/src/config.ts'
import * as workers from '../api/src/workers/index.ts'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { S3Backend } from '@data-fair/data-fair-api/src/files-storage/s3.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'
import { Readable } from 'node:stream'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('S3 multipart copy', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it.only('should use multipart copy for files larger than threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const s3Backend = filesStorage as S3Backend
    const originalMaxSingleCopySize = config.s3.maxSingleCopySize
    const originalMultipartChunkSize = config.s3.multipartChunkSize
    config.s3.maxSingleCopySize = 10 * 1024 * 1024
    config.s3.multipartChunkSize = 5 * 1024 * 1024

    try {
      async function * generateString () {
        for (let i = 0; i < 100 * 1024; i++) {
          yield '012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789'
        }
      }
      const testFilePath = `${dataDir}/multipart-test-source.txt`
      const testFileDestPath = `${dataDir}/multipart-test-dest.txt`

      await s3Backend.writeStream(Readable.from(generateString()), testFilePath)
      await s3Backend.copyFile(testFilePath, testFileDestPath)

      const destExists = await filesStorage.pathExists(testFileDestPath)
      assert.ok(destExists, 'Destination file should exist after copy')

      const destStats = await filesStorage.fileStats(testFileDestPath)
      assert.equal(destStats.size, 12288000, 'Destination file should have same size')

      await s3Backend.removeFile(testFilePath)
      await s3Backend.removeFile(testFileDestPath)
    } finally {
      config.s3.maxSingleCopySize = originalMaxSingleCopySize
      config.s3.multipartChunkSize = originalMultipartChunkSize
    }
  })

  it('should use single copy for files smaller than threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const s3Backend = filesStorage as S3Backend
    const originalMaxSingleCopySize = config.s3.maxSingleCopySize
    config.s3.maxSingleCopySize = 10000

    try {
      const testFileContent = 'a'.repeat(2000)
      const testFilePath = `${dataDir}/single-copy-source.txt`
      const testFileDestPath = `${dataDir}/single-copy-dest.txt`

      await s3Backend.writeString(testFilePath, testFileContent)
      await s3Backend.copyFile(testFilePath, testFileDestPath)

      const destExists = await filesStorage.pathExists(testFileDestPath)
      assert.ok(destExists, 'Destination file should exist after copy')

      const destStats = await filesStorage.fileStats(testFileDestPath)
      assert.equal(destStats.size, 2000, 'Destination file should have same size')

      await s3Backend.removeFile(testFilePath)
      await s3Backend.removeFile(testFileDestPath)
    } finally {
      config.s3.maxSingleCopySize = originalMaxSingleCopySize
    }
  })

  it('should use multipart copy during draft validation with small threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const originalMaxSingleCopySize = config.s3.maxSingleCopySize
    const originalMultipartChunkSize = config.s3.multipartChunkSize
    config.s3.maxSingleCopySize = 1000
    config.s3.multipartChunkSize = 500

    try {
      const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')
      const form = new FormData()
      form.append('file', datasetFd, 'dataset.csv')
      const ax = dmeadus

      const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
      assert.equal(res.status, 201)

      const dataset = await workers.hook('analyzeCsv/' + res.data.id)
      assert.equal(dataset.status, 'draft')

      await workers.hook('finalize/' + dataset.id)
      assert.equal(dataset.status, 'draft')

      await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
      const finalizedDataset = await workers.hook('finalize/' + dataset.id)
      assert.equal(finalizedDataset.status, 'finalized')
    } finally {
      config.s3.maxSingleCopySize = originalMaxSingleCopySize
      config.s3.multipartChunkSize = originalMultipartChunkSize
    }
  })
})
