import { strict as assert } from 'node:assert'

import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders } from './utils/index.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { S3Backend } from '@data-fair/data-fair-api/src/files-storage/s3.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('S3 multipart copy', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should use multipart copy for files larger than threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const s3Backend = filesStorage as S3Backend
    const cfg = config as any
    const originalMaxSingleCopySize = cfg.get('s3.maxSingleCopySize')
    const originalMultipartChunkSize = cfg.get('s3.multipartChunkSize')

    cfg.set('s3.maxSingleCopySize', 1000)
    cfg.set('s3.multipartChunkSize', 500)

    try {
      const testFileContent = 'a'.repeat(2000)
      const testFilePath = `${dataDir}/multipart-test-source.txt`
      const testFileDestPath = `${dataDir}/multipart-test-dest.txt`

      await fs.ensureDir(dataDir)
      await fs.writeFile(testFilePath, testFileContent)

      await s3Backend.copyFile(testFilePath, testFileDestPath)

      const destExists = await filesStorage.pathExists(testFileDestPath)
      assert.ok(destExists, 'Destination file should exist after copy')

      const destStats = await filesStorage.fileStats(testFileDestPath)
      assert.equal(destStats.size, 2000, 'Destination file should have same size')

      await fs.remove(testFilePath)
      await fs.remove(testFileDestPath)
    } finally {
      cfg.set('s3.maxSingleCopySize', originalMaxSingleCopySize)
      cfg.set('s3.multipartChunkSize', originalMultipartChunkSize)
    }
  })

  it('should use single copy for files smaller than threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const s3Backend = filesStorage as S3Backend
    const cfg = config as any
    const originalMaxSingleCopySize = cfg.get('s3.maxSingleCopySize')

    cfg.set('s3.maxSingleCopySize', 10000)

    try {
      const testFileContent = 'a'.repeat(2000)
      const testFilePath = `${dataDir}/single-copy-source.txt`
      const testFileDestPath = `${dataDir}/single-copy-dest.txt`

      await fs.ensureDir(dataDir)
      await fs.writeFile(testFilePath, testFileContent)

      await s3Backend.copyFile(testFilePath, testFileDestPath)

      const destExists = await filesStorage.pathExists(testFileDestPath)
      assert.ok(destExists, 'Destination file should exist after copy')

      const destStats = await filesStorage.fileStats(testFileDestPath)
      assert.equal(destStats.size, 2000, 'Destination file should have same size')

      await fs.remove(testFilePath)
      await fs.remove(testFileDestPath)
    } finally {
      cfg.set('s3.maxSingleCopySize', originalMaxSingleCopySize)
    }
  })

  it('should use multipart copy during draft validation with small threshold', async function () {
    if (!(filesStorage instanceof S3Backend)) {
      console.log('Skipping test: not using S3 backend')
      return
    }

    const cfg = config as any
    const originalMaxSingleCopySize = cfg.get('s3.maxSingleCopySize')
    const originalMultipartChunkSize = cfg.get('s3.multipartChunkSize')

    cfg.set('s3.maxSingleCopySize', 1000)
    cfg.set('s3.multipartChunkSize', 500)

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
      cfg.set('s3.maxSingleCopySize', originalMaxSingleCopySize)
      cfg.set('s3.multipartChunkSize', originalMultipartChunkSize)
    }
  })
})
