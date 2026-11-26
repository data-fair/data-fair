import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import catalogApiDocs from '../../../api/contract/site-catalog-api-docs.js'
import { validateOpenApi } from '../../../api/src/remote-services/operations.ts'

test.describe('site catalog API docs', () => {
  test('is a valid OpenAPI 3.1 document describing both DCAT profiles', () => {
    const doc = catalogApiDocs('https://portal.test/data-fair', { type: 'data-fair-portals', id: 'p1', url: 'https://portal.test' }, { contact: { email: 'contact@org.test' } })
    assert.ok(validateOpenApi(doc), JSON.stringify(validateOpenApi.errors))
    assert.ok(doc.paths['/dcat'].get.responses[200].content['application/ld+json'])
    assert.ok(doc.paths['/dcat-ap'].get.responses[200].content['application/ld+json'])
  })
})
