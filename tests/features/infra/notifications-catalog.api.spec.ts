import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios } from '../../support/axios.ts'

const anonymous = axios()

test.describe('notifications topics catalog', () => {
  test('GET /notifications/topics-catalog returns the topics catalog', async () => {
    const res = await anonymous.get('/api/v1/notifications/topics-catalog')
    assert.equal(res.status, 200)
    const data = res.data
    assert.ok(Array.isArray(data), 'response body must be an array')

    const keys = data.map((e: any) => e.key)
    assert.ok(keys.includes('dataset-dataset-created'), 'must include dataset-dataset-created')
    assert.ok(keys.includes('dataset-error'), 'must include dataset-error')
    assert.ok(keys.includes('application-application-created'), 'must include application-application-created')
    assert.ok(keys.includes('application-error'), 'must include application-error')

    // zombie topics must be removed
    assert.ok(!keys.includes('dataset-publication'), 'zombie topic dataset-publication must be removed')
    assert.ok(!keys.includes('application-publication'), 'zombie topic application-publication must be removed')

    // every entry must have a bilingual title and a valid audience
    for (const entry of data) {
      assert.ok(entry.title?.fr, `${entry.key} missing FR title`)
      assert.ok(entry.title?.en, `${entry.key} missing EN title`)
      assert.ok(['subscription', 'webhook', 'both'].includes(entry.audience), `${entry.key} invalid audience`)
    }
  })
})
