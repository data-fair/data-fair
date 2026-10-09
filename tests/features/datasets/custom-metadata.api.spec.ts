import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import Module from 'node:module'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const XLSX = Module.createRequire(import.meta.url)('@e965/xlsx')

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
  test('a renamed list label reaches the datasets, a deleted entry is removed from them', async () => {
    const defs = (entries: any[]) => settingsWith([
      { key: 'service', title: 'Service', enum: entries },
      { key: 'domaines', title: 'Domaines', multiple: true, enum: entries }
    ])
    await testUser1.put(settingsUrl, defs([{ code: 'voi', label: 'Voirie' }, { code: 'urb', label: 'Urbanisme' }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: { code: 'urb' }, domaines: [{ code: 'voi' }, { code: 'urb' }] } }))).data
    const kept = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: { code: 'voi' } } }))).data
    await testUser1.put(settingsUrl, defs([{ code: 'voi', label: 'Voirie et réseaux' }]))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { domaines: [{ code: 'voi', label: 'Voirie et réseaux' }] })
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${kept.id}`)).data.customMetadata, { service: { code: 'voi', label: 'Voirie et réseaux' } })
  })

  test('a rename after the several values flag changed leaves the other shape alone', async () => {
    const def = (multiple: boolean, label: string) => settingsWith([{ key: 'domaines', title: 'Domaines', multiple, enum: [{ code: 'voi', label }] }])
    await testUser1.put(settingsUrl, def(true, 'Voirie'))
    const arrayDs = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: [{ code: 'voi' }] } }))).data
    await testUser1.put(settingsUrl, def(false, 'Voirie'))
    const objectDs = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { domaines: { code: 'voi' } } }))).data
    await testUser1.put(settingsUrl, def(false, 'Voirie et réseaux'))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${objectDs.id}`)).data.customMetadata, { domaines: { code: 'voi', label: 'Voirie et réseaux' } })
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${arrayDs.id}`)).data.customMetadata, { domaines: [{ code: 'voi', label: 'Voirie' }] })
    // a rename in the same save as the flag change is skipped, so switch back first
    await testUser1.put(settingsUrl, def(true, 'Voirie et réseaux'))
    await testUser1.put(settingsUrl, def(true, 'Voies'))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${arrayDs.id}`)).data.customMetadata, { domaines: [{ code: 'voi', label: 'Voies' }] })
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${objectDs.id}`)).data.customMetadata, { domaines: { code: 'voi', label: 'Voirie et réseaux' } })
  })

  test('a definition whose type changed keeps its stored values', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', enum: [{ code: 'voi', label: 'Voirie' }] }]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: { code: 'voi' } } }))).data
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service', type: 'date' }]))
    assert.deepEqual((await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.customMetadata, { service: { code: 'voi', label: 'Voirie' } })
  })
  test('the spreadsheet export prints the display text of values that fit their definition', async () => {
    await testUser1.put(settingsUrl, settingsWith([{ key: 'service', title: 'Service' }, ...DEFS.slice(1)]))
    const ds = (await testUser1.post('/api/v1/datasets', restDataset({ customMetadata: { service: 'Voirie', domaines: ['a', 'b'], contact: { url: 'https://a.fr', title: 'A' } } }))).data
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
