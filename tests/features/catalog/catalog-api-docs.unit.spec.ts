import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

test.describe('site catalog API docs', () => {
  test('is a valid OpenAPI 3.1 document describing the DCAT catalog', async () => {
    const catalogApiDocs = (await import('../../../api/contract/site-catalog-api-docs.js')).default
    const { validateOpenApi } = await import('../../../api/src/remote-services/operations.ts')
    const doc = catalogApiDocs('https://portal.test/data-fair', { type: 'data-fair-portals', id: 'p1', url: 'https://portal.test' }, { contact: { email: 'contact@org.test' } })
    assert.ok(validateOpenApi(doc), JSON.stringify(validateOpenApi.errors))
    assert.ok(doc.paths['/dcat'].get.responses[200].content['application/ld+json'])
    assert.ok(!('/dcat-ap' in doc.paths))
  })
})
