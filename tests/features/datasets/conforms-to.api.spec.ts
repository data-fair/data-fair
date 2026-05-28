import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')

test.describe('dataset conformsTo metadata', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('persists a full conformsTo object via PATCH', async () => {
    const id = 'conforms-1'
    await u1.post('/api/v1/datasets/' + id, {
      isMetaOnly: true,
      title: id
    })
    const body = {
      conformsTo: { title: 'My Schema', version: '1.0.0', url: 'https://example.com/schema.json' }
    }
    const patched = await u1.patch('/api/v1/datasets/' + id, body)
    assert.deepEqual(patched.data.conformsTo, body.conformsTo)

    const fetched = await u1.get('/api/v1/datasets/' + id)
    assert.deepEqual(fetched.data.conformsTo, body.conformsTo)
  })

  test('clears conformsTo via PATCH with null', async () => {
    const id = 'conforms-clear'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.patch('/api/v1/datasets/' + id, {
      conformsTo: { title: 'Schema A', version: '1.0', url: 'https://example.com/a.json' }
    })
    // Patch with null triggers $unset in mongo (api/src/datasets/service.js:517).
    // The PATCH response still echoes the null (in-memory Object.assign), but
    // the persisted dataset has the field unset — verify via a fresh GET.
    await u1.patch('/api/v1/datasets/' + id, { conformsTo: null })
    const fetched = await u1.get('/api/v1/datasets/' + id)
    assert.equal(fetched.data.conformsTo, undefined)
  })

  test('persists a partial conformsTo (title + url only)', async () => {
    const id = 'conforms-2'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    const body = { conformsTo: { title: 'Half Schema', url: 'https://example.com/half.json' } }
    const patched = await u1.patch('/api/v1/datasets/' + id, body)
    assert.equal(patched.data.conformsTo.title, 'Half Schema')
    assert.equal(patched.data.conformsTo.url, 'https://example.com/half.json')
    assert.equal(patched.data.conformsTo.version, undefined)
  })

  test('conformsTo facet returns distinct triples for the owner', async () => {
    // Seed three datasets with two distinct triples (one duplicated)
    await u1.post('/api/v1/datasets/conforms-a1', { isMetaOnly: true, title: 'a1' })
    await u1.patch('/api/v1/datasets/conforms-a1', {
      conformsTo: { title: 'Schema A', version: '1.0', url: 'https://example.com/a.json' }
    })
    await u1.post('/api/v1/datasets/conforms-a2', { isMetaOnly: true, title: 'a2' })
    await u1.patch('/api/v1/datasets/conforms-a2', {
      conformsTo: { title: 'Schema A', version: '1.0', url: 'https://example.com/a.json' } // duplicate
    })
    await u1.post('/api/v1/datasets/conforms-b', { isMetaOnly: true, title: 'b' })
    await u1.patch('/api/v1/datasets/conforms-b', {
      conformsTo: { title: 'Schema B', version: '2.1', url: 'https://example.com/b.json' }
    })
    // One dataset without conformsTo — must NOT appear
    await u1.post('/api/v1/datasets/conforms-empty', { isMetaOnly: true, title: 'empty' })

    // axiosAuth('test_user1@test.com') creates datasets owned by { type: 'user', id: 'test_user1' }
    const res = await u1.get('/api/v1/datasets?size=0&facets=conformsTo&owner=user:test_user1')
    const triples = (res.data.facets?.conformsTo ?? []).map((f: any) => f.value)
    assert.equal(triples.length, 2)
    const titles = triples.map((t: any) => t.title).sort()
    assert.deepEqual(titles, ['Schema A', 'Schema B'])
  })

  test('conformsTo facet does not leak triples from another user', async () => {
    // user2 seeds a private schema reference
    const u2 = await axiosAuth('test_user2@test.com')
    await u2.post('/api/v1/datasets/conforms-u2', { isMetaOnly: true, title: 'u2 dataset' })
    await u2.patch('/api/v1/datasets/conforms-u2', {
      conformsTo: { title: 'Private Schema', version: '1.0', url: 'https://example.com/private.json' }
    })

    // user1 querying their own org must not see user2's triple
    const res = await u1.get('/api/v1/datasets?size=0&facets=conformsTo&owner=user:test_user1')
    const titles = (res.data.facets?.conformsTo ?? []).map((f: any) => f.value.title)
    assert.ok(!titles.includes('Private Schema'))
  })

  test('initFrom with parts: schema inherits conformsTo from source', async () => {
    // Seed a reference dataset with conformsTo. We don't wait for the parent
    // to finalize — REST datasets with no data finalize too fast for the WS
    // subscription to catch the event; we only need the parent document in
    // Mongo before the init-from worker runs on the child.
    await u1.post('/api/v1/datasets/conforms-ref', { isRest: true, title: 'Reference', schema: [{ key: 'a', type: 'string' }] })
    await u1.patch('/api/v1/datasets/conforms-ref', {
      conformsTo: { title: 'Inherited Schema', version: '1.0', url: 'https://example.com/inherit.json' }
    })

    // Create a new dataset via initFrom, picking up the schema part
    const createRes = await u1.post('/api/v1/datasets', {
      isRest: true,
      title: 'Inheritor',
      initFrom: { dataset: 'conforms-ref', parts: ['schema'] }
    })
    const newId = createRes.data.id
    await waitForFinalize(u1, newId)

    const fetched = await u1.get('/api/v1/datasets/' + newId)
    assert.deepEqual(fetched.data.conformsTo, {
      title: 'Inherited Schema',
      version: '1.0',
      url: 'https://example.com/inherit.json'
    })
  })

  test('initFrom WITHOUT schema part does NOT inherit conformsTo', async () => {
    await u1.post('/api/v1/datasets/conforms-ref2', { isRest: true, title: 'Ref2', schema: [{ key: 'a', type: 'string' }] })
    await u1.patch('/api/v1/datasets/conforms-ref2', {
      conformsTo: { title: 'Not Inherited', url: 'https://example.com/notinherit.json' }
    })

    const createRes = await u1.post('/api/v1/datasets', {
      isRest: true,
      title: 'Non-inheritor',
      initFrom: { dataset: 'conforms-ref2', parts: ['description'] }
    })
    const newId = createRes.data.id
    await waitForFinalize(u1, newId)

    const fetched = await u1.get('/api/v1/datasets/' + newId)
    assert.equal(fetched.data.conformsTo, undefined)
  })

  test('initFrom with parts: schema inherits partial conformsTo (title only)', async () => {
    await u1.post('/api/v1/datasets/conforms-ref3', { isRest: true, title: 'Ref3', schema: [{ key: 'a', type: 'string' }] })
    await u1.patch('/api/v1/datasets/conforms-ref3', {
      conformsTo: { title: 'Partial Schema' }
    })

    const createRes = await u1.post('/api/v1/datasets', {
      isRest: true,
      title: 'Inheritor3',
      initFrom: { dataset: 'conforms-ref3', parts: ['schema'] }
    })
    const newId = createRes.data.id
    await waitForFinalize(u1, newId)

    const fetched = await u1.get('/api/v1/datasets/' + newId)
    assert.deepEqual(fetched.data.conformsTo, { title: 'Partial Schema' })
  })
})
