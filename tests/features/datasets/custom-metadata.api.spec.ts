import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const settingsUrl = '/api/v1/settings/user/test_user1'
const settingsWith = (custom: any[]) => ({ datasetsMetadata: { custom } })

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
})
