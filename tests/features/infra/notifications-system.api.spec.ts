import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { doAndWaitForFinalize } from '../../support/workers.ts'
import { collectNotifs, expectNotifPair } from '../../support/notifications.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

/**
 * Cross-cutting invariants of the notification system (see docs/architecture/notifications.md).
 *
 * Two other system-level guarantees are tested incidentally by feature specs and therefore
 * do not need a dedicated case here:
 *   - Error umbrella fan-out (`<resource>-error` reused _id) — covered by
 *     `datasets-features/file-validation.api.spec.ts` "create an invalid dataset…".
 *   - Worker → main thread event forwarding (`api/src/workers/tasks.ts`) — covered by any
 *     test that observes a `validated` or `validation-error` notif, both of which are
 *     emitted from `api/src/workers/batch-processor/process-file.ts` and only reach the
 *     test buffer through the parentPort → main-thread bridge.
 */
test.describe('infra - notification system', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // §12 in notifications.md — sendResourceEvent fans out the same _id on slug+id topics
  // so back-office subscriptions (slug-based) and portal subscriptions (id-based) both fire,
  // while the events service deduplicates the stored event on the shared _id.
  test('sendResourceEvent dual-emits on slug and id topics with a shared _id', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'dual-emit topics',
      schema: [{ key: 'str', type: 'string' }, { key: 'drop_me', type: 'string' }]
    })).data
    assert.notEqual(dataset.id, dataset.slug, 'precondition: id should differ from slug')

    const notifs = await collectNotifs()
    await doAndWaitForFinalize(ax, dataset.id, () => ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema.filter((f: any) => f.key !== 'drop_me')
    }))
    // structure-updated + breaking-change, each on slug+id → 4 expected entries
    const captured = await notifs.waitFor(4, { keyPrefix: 'data-fair:dataset-' })

    expectNotifPair(captured, 'data-fair:dataset-structure-updated', dataset)
    expectNotifPair(captured, 'data-fair:dataset-breaking-change', dataset)
  })
})
