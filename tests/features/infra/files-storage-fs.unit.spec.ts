import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Exact-match `fileExists` on the fs backend, mirroring the semantics pinned for the S3
// backend in files-storage-s3.api.spec.ts. The fs backend must be importable without
// loading #config in the test process (config is only needed by checkAccess).

test.describe('fs files-storage backend', () => {
  let backend: any
  let dir: string

  test.beforeAll(async () => {
    const { FsBackend } = await import('../../../api/src/files-storage/fs.ts')
    dir = await mkdtemp(join(tmpdir(), 'df-files-storage-fs-'))
    backend = new FsBackend(dir)
    await mkdir(join(dir, 'attachments'))
    await writeFile(join(dir, 'attachments', '03kp0009.jpg'), 'fake jpg content')
  })

  test.afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('fileExists requires an exact file match', async () => {
    assert.equal(await backend.fileExists(join(dir, 'attachments', '03kp0009.jpg')), true)
    // a strict prefix of an existing file is not an existing file
    assert.equal(await backend.fileExists(join(dir, 'attachments', '03kp0009')), false)
    // a directory is not a file
    assert.equal(await backend.fileExists(join(dir, 'attachments')), false)
  })
})
