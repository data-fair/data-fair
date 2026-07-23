import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

// Per-line attachment content loading for indexing, extracted from prepareCalculations
// (extensions.ts) with the storage backend injected so it can be unit-tested.
//
// Defense in depth for the "UnknownError" incident: on S3 the existence check and the
// subsequent stats/read are separate requests on a shared-nothing store, so the file can
// be reported present and still 404 on read (prefix-matching pathExists before the fix,
// eventual consistency or concurrent deletion after it). A missing attachment must
// degrade to a per-line warning — it must never fail the whole indexing task.

const streamOf = (content: string) => ({ body: Readable.from([Buffer.from(content)]), size: content.length, lastModified: new Date() })

const consistentStorage = (content: string) => ({
  fileExists: async () => true,
  fileStats: async () => ({ size: content.length, lastModified: new Date() }),
  readStream: async () => streamOf(content)
})

test.describe('readAttachmentContent', () => {
  let readAttachmentContent: (storage: any, filePath: string, attachmentIndexedLimit: number) => Promise<{ raw?: string, warning?: string }>

  test.beforeAll(async () => {
    // dynamic import: the module does not exist yet when this suite is first added (TDD),
    // and a static import of a missing module would abort the whole test collection
    ({ readAttachmentContent } = await import('../../../../api/src/datasets/utils/attachment-content.ts'))
  })
  test('returns the base64 content of an existing attachment', async () => {
    const result = await readAttachmentContent(consistentStorage('fake jpg content') as any, '/data/attachments/03kp0009.jpg', -1)
    assert.equal(result.raw, Buffer.from('fake jpg content').toString('base64'))
    assert.equal(result.warning, undefined)
  })

  test('returns nothing when the attachment file is absent', async () => {
    const storage = { ...consistentStorage('x'), fileExists: async () => false }
    const result = await readAttachmentContent(storage as any, '/data/attachments/03kp0009', -1)
    assert.deepEqual(result, {})
  })

  test('warns instead of indexing when the attachment exceeds the indexed-size limit', async () => {
    const storage = consistentStorage('fake jpg content')
    const result = await readAttachmentContent(storage as any, '/data/attachments/03kp0009.jpg', 4)
    assert.equal(result.raw, undefined)
    assert.match(result.warning!, /volumineuse/)
  })

  test('warns instead of throwing when the file 404s after the existence check', async () => {
    // mapped backend error (fileStats after the boundary fix)
    const storage = {
      ...consistentStorage('x'),
      fileStats: async () => { throw Object.assign(new Error('file not found'), { status: 404 }) }
    }
    const result = await readAttachmentContent(storage as any, '/data/attachments/03kp0009', -1)
    assert.equal(result.raw, undefined)
    assert.match(result.warning!, /introuvable/)
  })

  test('warns instead of throwing on a raw AWS-SDK NotFound whose message is "UnknownError"', async () => {
    // the exact error shape of the incident: HeadObject 404 has no body, so the SDK
    // throws name "NotFound" with the literal message "UnknownError"
    const storage = {
      ...consistentStorage('x'),
      fileStats: async () => { throw Object.assign(new Error('UnknownError'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }) }
    }
    const result = await readAttachmentContent(storage as any, '/data/attachments/03kp0009', -1)
    assert.equal(result.raw, undefined)
    assert.match(result.warning!, /introuvable/)
  })

  test('warns when the read stream itself 404s', async () => {
    const storage = {
      ...consistentStorage('x'),
      readStream: async () => { throw Object.assign(new Error('file not found'), { status: 404 }) }
    }
    const result = await readAttachmentContent(storage as any, '/data/attachments/03kp0009', -1)
    assert.equal(result.raw, undefined)
    assert.match(result.warning!, /introuvable/)
  })

  test('propagates non-404 storage errors', async () => {
    const storage = {
      ...consistentStorage('x'),
      fileStats: async () => { throw Object.assign(new Error('service unavailable'), { status: 503 }) }
    }
    await assert.rejects(readAttachmentContent(storage as any, '/data/attachments/03kp0009.jpg', -1), /service unavailable/)
  })
})
