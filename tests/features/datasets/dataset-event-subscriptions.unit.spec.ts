import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getResourceTopics } from '../../../ui/src/components/common/resource-topics.ts'

test.describe('dataset event subscriptions', () => {
  test('webhooks and notifications offer every dataset topic with its label', () => {
    const dataset = { id: 'ds1', title: 'Webhooks check', owner: { type: 'user', id: 'u1' }, isRest: true }
    const webhooks = getResourceTopics(dataset, 'dataset', 'webhooks', 'fr')
    assert.deepEqual(webhooks.map(t => t.key), [
      'data-fair:dataset-data-updated:ds1',
      'data-fair:dataset-structure-updated:ds1',
      'data-fair:dataset-error:ds1',
      'data-fair:dataset-breaking-change:ds1'
    ])
    assert.equal(webhooks[0].title, 'Les données du jeu de données ont été mises à jour')
    assert.ok(webhooks.every(t => t.title && t.title !== 'Webhooks check'))

    // REST line operations signal data-updated to webhooks only
    const notifications = getResourceTopics(dataset, 'dataset', 'notifications', 'fr')
    assert.deepEqual(notifications.map(t => t.key), webhooks.slice(1).map(t => t.key))
  })
})
