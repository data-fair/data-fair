import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// es.ts imports `#config`; point node-config at the real api/config dir before the dynamic import
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

test.describe('attachment ingest pipeline id', () => {
  test('is derived from the indices prefix', async () => {
    const { attachmentPipelineId } = await import('../../../api/src/es.ts')
    assert.equal(attachmentPipelineId('dataset-development'), 'attachment-dataset-development')
  })

  test('differs between two prefixes sharing a cluster', async () => {
    const { attachmentPipelineId } = await import('../../../api/src/es.ts')
    assert.notEqual(attachmentPipelineId('dataset-a'), attachmentPipelineId('dataset-b'))
  })
})
