import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import FormData from 'form-data'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { doAndWaitForFinalize, sendDataset, waitForFinalize } from '../../support/workers.ts'
import { collectNotifs, expectNotif, expectNotifPair } from '../../support/notifications.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')

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

  // §6 in notifications.md — every event goes through notifications.send, which attributes
  // an api key session to originator.apiKey instead of a pseudo-user named after the key
  test('events emitted by an api key are attributed to the api key', async () => {
    const settings = (await testUser1Org.put('/api/v1/settings/organization/test_org1', {
      apiKeys: [{ title: 'catalogs', scopes: ['datasets', 'applications'] }]
    })).data
    const apiKey = settings.apiKeys[0]
    const axKey = axios({ headers: { 'x-apiKey': apiKey.clearKey } })
    const expectApiKeyOriginator = (notif: any) => {
      assert.deepEqual(notif.originator, { apiKey: { id: apiKey.id, title: 'catalogs' } }, notif.topic.key)
    }

    let dataset = await sendDataset('datasets/dataset1.csv', axKey)

    // file update by the api key: the case where the draft patched-properties event lost it
    let notifs = await collectNotifs()
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await axKey.post(`/api/v1/datasets/${dataset.id}`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    dataset = await waitForFinalize(axKey, dataset.id)
    let captured = await notifs.waitFor(1, { keyPrefix: 'data-fair:dataset-draft-patched-properties:' })
    expectApiKeyOriginator(expectNotif(captured, `data-fair:dataset-draft-patched-properties:${dataset.id}`))
    expectApiKeyOriginator(expectNotifPair(captured, 'data-fair:dataset-draft-data-updated', dataset).id)

    notifs = await collectNotifs()
    await axKey.patch(`/api/v1/datasets/${dataset.id}`, { title: 'renamed by api key' })
    captured = await notifs.waitFor(1, { keyPrefix: 'data-fair:dataset-patched-properties:' })
    expectApiKeyOriginator(expectNotif(captured, `data-fair:dataset-patched-properties:${dataset.id}`))

    const application = (await axKey.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    notifs = await collectNotifs()
    await axKey.patch(`/api/v1/applications/${application.id}`, { title: 'renamed by api key' })
    captured = await notifs.waitFor(1, { keyPrefix: 'data-fair:application-patched-properties:' })
    expectApiKeyOriginator(expectNotif(captured, `data-fair:application-patched-properties:${application.id}`))

    // a user level key: its session user is the owner, the originator keeps the owner name but the key id
    const userSettings = (await testUser1.put('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'user key', scopes: ['datasets'] }]
    })).data
    const userKey = userSettings.apiKeys[0]
    const axUserKey = axios({ headers: { 'x-apiKey': userKey.clearKey } })
    const userDataset = (await axUserKey.post('/api/v1/datasets', { isRest: true, title: 'user key dataset', schema: [{ key: 'str', type: 'string' }] })).data
    notifs = await collectNotifs()
    await axUserKey.patch(`/api/v1/datasets/${userDataset.id}`, { title: 'renamed by user key' })
    captured = await notifs.waitFor(1, { keyPrefix: 'data-fair:dataset-patched-properties:' })
    assert.deepEqual(expectNotif(captured, `data-fair:dataset-patched-properties:${userDataset.id}`).originator, { apiKey: { id: userKey.id, title: 'Test User1 (user key)' } })

    // a human session keeps the originator built by the events queue from the session
    notifs = await collectNotifs()
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { title: 'renamed by a user' })
    captured = await notifs.waitFor(1, { keyPrefix: 'data-fair:dataset-patched-properties:' })
    const userNotif = expectNotif(captured, `data-fair:dataset-patched-properties:${dataset.id}`)
    assert.equal(userNotif.originator.apiKey, undefined)
    assert.equal(userNotif.originator.user.id, 'test_user1')
    assert.equal(userNotif.originator.organization.id, 'test_org1')
  })
})
