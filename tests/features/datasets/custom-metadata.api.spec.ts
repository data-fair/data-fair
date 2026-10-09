import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import Module from 'node:module'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const XLSX = Module.createRequire(import.meta.url)('@e965/xlsx')

const testUser1 = await axiosAuth('test_user1@test.com')
const settingsUrl = '/api/v1/settings/user/test_user1'
const settingsWith = (custom: any[]) => ({ datasetsMetadata: { custom } })
const DEFS = [
  { key: 'service', title: 'Service', enum: ['Voirie'] },
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

  test('list values are trimmed, blanks and duplicates dropped', async () => {
    const res = await testUser1.put(settingsUrl, settingsWith([
      { title: 'Service référent', enum: [' Voirie ', 'Voirie', ' ', 'Urbanisme'] }
    ]))
    assert.deepEqual(res.data.datasetsMetadata.custom[0].enum, ['Voirie', 'Urbanisme'])
  })

  test('a non text definition drops its value list and multiple flag', async () => {
    const res = await testUser1.put(settingsUrl, settingsWith([
      { title: 'Date de validation', type: 'date', multiple: true, enum: ['A'] }
    ]))
    const def = res.data.datasetsMetadata.custom[0]
    assert.equal(def.type, 'date')
    assert.equal(def.enum, undefined)
    assert.equal(def.multiple, undefined)
  })
  test('typed values are stored as sent', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    const res = await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      customMetadata: {
        service: 'Voirie',
        domaines: ['a', 'b'],
        validation: '2026-03-12',
        contact: { url: 'https://a.fr' },
        effectif: 0
      }
    })
    assert.deepEqual(res.data.customMetadata, {
      service: 'Voirie',
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
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { service: 'Autre' } }), (err: any) => err.status === 400 && err.data.includes('Service : valeur absente de la liste'))
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { contact: { title: 'no url' } } }), { status: 400 })
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { contact: { url: 'a.fr' } } }), (err: any) => err.status === 400 && err.data.includes('Contact : adresse web attendue'))
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { effectif: 1.5 } }), (err: any) => err.status === 400 && err.data.includes('Effectif : nombre entier attendu'))
    await assert.rejects(testUser1.put(`/api/v1/datasets/${ds.id}`, { ...restDataset(), customMetadata: { effectif: 1.5 } }), { status: 400 })
  })

  test('a value entered before its definition changed is kept and does not block other writes', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie' } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: ['Voies'] }]))
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
  test('a value removed from the list stays stored, hidden until it fits again', async () => {
    const defs = (values: string[]) => settingsWith([
      { key: 'service', title: 'Service', enum: values },
      { key: 'domaines', title: 'Domaines', multiple: true, enum: values }
    ])
    await testUser1.put(settingsUrl, defs(['Voirie', 'Urbanisme']))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Urbanisme', domaines: ['Voirie', 'Urbanisme'] } }))).data
    await testUser1.put(settingsUrl, defs(['Voirie']))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { service: 'Urbanisme', domaines: ['Voirie', 'Urbanisme'] })
  })

  test('a definition whose type changed keeps its stored values', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: ['Voirie'] }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie' } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', type: 'date' }]))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { service: 'Voirie' })
  })
  test('the spreadsheet export prints the display text of values that fit their definition', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service' }, ...DEFS.slice(1)]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Autre', domaines: ['a', 'b'], contact: { url: 'https://a.fr', title: 'A' } } }))).data
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    const res = await testUser1.get(`/api/v1/datasets/${ds.id}/lines`, { params: { format: 'xlsx' }, responseType: 'arraybuffer' })
    const workbook = XLSX.read(res.data)
    const rows: string[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[1]], { header: 1 })
    const valueOf = (key: string) => rows.find(row => row[0] === key)?.[2] ?? ''
    assert.equal(valueOf('service'), '')
    assert.equal(valueOf('domaines'), 'a, b')
    assert.equal(valueOf('contact'), 'A (https://a.fr)')
  })
})
