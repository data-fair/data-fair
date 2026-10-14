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
  test('a custom-<key> facet lists the values entered, one per item', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: ['a', 'b'] } }))
    await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: ['a'] } }))
    const res = await testUser1.get('/api/v1/datasets', { params: { size: 0, facets: 'custom-domaines', owner: 'user:test_user1' } })
    assert.deepEqual(res.data.facets['custom-domaines'], [{ count: 2, value: 'a' }, { count: 1, value: 'b' }])
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

  test('blank values are removed, not stored nor refused', async () => {
    await testUser1.put(settingsUrl, settingsWith([...DEFS, { key: 'other', title: 'Other' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    const res = await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      customMetadata: { service: '', domaines: [' a ', '  '], contact: { url: '  ' }, other: ' x ' }
    })
    assert.deepEqual(res.data.customMetadata, { domaines: ['a'], other: 'x' })
  })

  test('a key without a definition is refused', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset())).data
    await assert.rejects(testUser1.patch(`/api/v1/datasets/${ds.id}`, { customMetadata: { undeclared: 'x' } }), { status: 400 })
  })
  test('a value removed from the list is removed from the datasets', async () => {
    const defs = (values: string[]) => settingsWith([
      { key: 'service', title: 'Service', enum: values },
      { key: 'domaines', title: 'Domaines', multiple: true, enum: values },
      { key: 'themes', title: 'Thèmes', multiple: true, enum: values }
    ])
    await testUser1.put(settingsUrl, defs(['Voirie', 'Urbanisme']))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Urbanisme', domaines: ['Voirie', 'Urbanisme'], themes: ['Urbanisme'] } }))).data
    const kept = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie' } }))).data
    await testUser1.put(settingsUrl, defs(['Voirie']))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { domaines: ['Voirie'] })
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${kept.id}`)).data.customMetadata, { service: 'Voirie' })
  })

  test('a free text metadata turned into a list keeps only the listed values', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Autre' } }))).data
    const kept = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie' } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: ['Voirie'] }]))
    assert.equal((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata?.service, undefined)
    assert.equal((await testUser1.get(`/api/v1/datasets/${kept.id}`)).data.customMetadata.service, 'Voirie')
  })

  test('a definition whose type or multiple flag changed is emptied on the datasets', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: ['Voirie'] }, { key: 'domaines', title: 'Domaines' }, { key: 'kept', title: 'Kept' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie', domaines: 'a', kept: 'b' } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', type: 'date' }, { key: 'domaines', title: 'Domaines', multiple: true }, { key: 'kept', title: 'Kept renamed' }]))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { kept: 'b' })
  })

  test('a customMetadata facet counts the datasets using each definition', async () => {
    await testUser1.put(settingsUrl, settingsWith(DEFS))
    await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: ['a', 'b'], service: 'Voirie' } }))
    await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: ['a'] } }))
    await testUser1.post('/api/v1/datasets', restDataset())
    const res = await testUser1.get('/api/v1/datasets', { params: { size: 0, facets: 'customMetadata', owner: 'user:test_user1' } })
    assert.deepEqual(res.data.facets.customMetadata, [{ count: 2, value: 'domaines' }, { count: 1, value: 'service' }])
  })
  test('the spreadsheet export prints the display text of the values', async () => {
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
