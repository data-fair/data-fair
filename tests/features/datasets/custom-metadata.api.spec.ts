import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const settingsUrl = '/api/v1/settings/user/test_user1'
const settingsWith = (custom: any[]) => ({ datasetsMetadata: { custom } })
const DEFS = [
  { key: 'service', title: 'Service', enum: [{ code: 'VOI', label: 'Voirie' }] },
  { key: 'domaines', title: 'Domaines', multiple: true },
  { key: 'validation', title: 'Validation', type: 'date' },
  { key: 'contact', title: 'Contact', type: 'link' },
  { key: 'effectif', title: 'Effectif', type: 'integer' }
]
const restDataset = (extra = {}) => ({ isRest: true, title: 'typed', schema: [{ key: 'a', type: 'string' }], ...extra })

test.describe('typed custom metadata', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('list codes are generated from labels, kept on rename, and a duplicate is refused', async () => {
    const res = await testUser1.put(settingsUrl, settingsWith([
      { title: 'Service référent', enum: [{ label: 'Voirie' }, { code: 'URB', label: 'Urbanisme' }] }
    ]))
    assert.deepEqual(res.data.datasetsMetadata.custom[0].enum, [{ code: 'voirie', label: 'Voirie' }, { code: 'URB', label: 'Urbanisme' }])
    const renamed = await testUser1.put(settingsUrl, settingsWith([
      { ...res.data.datasetsMetadata.custom[0], enum: [{ code: 'voirie', label: 'Voirie et réseaux' }] }
    ]))
    assert.deepEqual(renamed.data.datasetsMetadata.custom[0].enum, [{ code: 'voirie', label: 'Voirie et réseaux' }])
    await assert.rejects(testUser1.put(settingsUrl, settingsWith([
      { title: 'Service référent', enum: [{ label: 'Voirie' }, { label: 'voirie' }] }
    ])), { status: 400 })
  })

  test('a non text definition drops its value list and multiple flag', async () => {
    const res = await testUser1.put(settingsUrl, settingsWith([
      { title: 'Date de validation', type: 'date', multiple: true, enum: [{ code: 'a', label: 'A' }] }
    ]))
    const def = res.data.datasetsMetadata.custom[0]
    assert.equal(def.type, 'date')
    assert.equal(def.enum, undefined)
    assert.equal(def.multiple, undefined)
  })
  test('typed values are stored, list values with the current label', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    const res = await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      customMetadata: {
        service: { code: 'VOI', label: 'anything' },
        domaines: ['a', 'b'],
        validation: '2026-03-12',
        contact: { url: 'https://a.fr' },
        effectif: 0
      }
    })
    assert.deepEqual(res.data.customMetadata, {
      service: { code: 'VOI', label: 'Voirie' },
      domaines: ['a', 'b'],
      validation: '2026-03-12',
      contact: { url: 'https://a.fr' },
      effectif: 0
    })
  })

  test('a value that does not fit its definition is refused, at creation too', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    await assert.rejects(testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { effectif: 1.5 } })), { status: 400 })
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { service: { code: 'XXX' } } }), { status: 400 })
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { contact: { title: 'no url' } } }), { status: 400 })
    await assert.rejects(testUser1.put(`/api/v1/datasets/${ds.id}`, { ...restDataset(), customMetadata: { effectif: 1.5 } }), { status: 400 })
  })

  test('a value entered before its definition changed is kept and does not block other writes', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie' } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: [{ code: 'VOI', label: 'Voirie' }] }]))
    const res = await testUser1.patch(`/api/v1/datasets/${ds.id}`, { title: 'renamed', customMetadata: { service: 'Voirie', other: 'undeclared keys stay accepted' } })
    assert.equal(res.data.customMetadata.service, 'Voirie')
  })

  test('blank values are removed, not stored nor refused', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    const res = await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      customMetadata: { service: '', domaines: [' a ', '  '], contact: { url: '  ' }, other: ' x ' }
    })
    assert.deepEqual(res.data.customMetadata, { domaines: ['a'], other: 'x' })
  })
})
