import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const u1Org = await axiosAuth('test_datafair_user1@test.com', 'test_datafair_org1')

const translatedSchema = (schema: any[]) => schema.filter(p => !p['x-calculated']).map(p => p.key === 'id'
  ? { ...p, title: 'Identifiant', 'x-labels': { koumoul: 'Koumoul SAS' }, 'x-i18n-title': { en: ' Identifier ', de: '' }, 'x-i18n-x-labels': { en: { koumoul: 'Koumoul Ltd', unknown: 'dropped' } } }
  : p)

test.describe('multilingual metadata', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('settings locales are normalized and validated', async () => {
    await u1Org.patch('/api/v1/settings/organization/test_datafair_org1', { metadataI18n: { active: true, defaultLocale: 'fr', locales: ['EN', 'en', 'fr', ' de '] } })
    const res = await u1Org.get('/api/v1/settings/organization/test_datafair_org1/metadata-i18n')
    assert.deepEqual(res.data, { active: true, defaultLocale: 'fr', locales: ['fr', 'en', 'de'] })
    await assert.rejects(u1Org.patch('/api/v1/settings/organization/test_datafair_org1', { metadataI18n: { active: true, locales: ['english'] } }), { status: 400 })
  })

  test('translations are cleaned on write and served with lang', async () => {
    await u1Org.post('/api/v1/datasets/i18n-1', {
      isMetaOnly: true,
      title: 'Eau potable',
      summary: 'Qualité',
      keywords: ['eau'],
      creator: 'Direction de l\'eau',
      spatial: 'Bretagne',
      attachments: [{ type: 'url', url: 'https://example.com/doc', title: 'Notice', description: 'Mode *emploi*', 'x-i18n-title': { en: ' Manual ' }, 'x-i18n-description': { en: 'How *to*', de: '' } }],
      'x-i18n-title': { en: ' Drinking water ', de: '' },
      'x-i18n-creator': { en: 'Water directorate' },
      'x-i18n-spatial': { en: 'Brittany' },
      'x-i18n-keywords': { en: ['water', ' water ', ''] }
    })
    let dataset = (await u1Org.get('/api/v1/datasets/i18n-1')).data
    assert.deepEqual(dataset['x-i18n-title'], { en: 'Drinking water' })
    assert.deepEqual(dataset['x-i18n-keywords'], { en: ['water'] })
    assert.deepEqual(dataset.attachments[0]['x-i18n-title'], { en: 'Manual' })
    assert.deepEqual(dataset.attachments[0]['x-i18n-description'], { en: 'How *to*' })

    await assert.rejects(u1Org.patch('/api/v1/datasets/i18n-1', { 'x-i18n-summary': { English: 'Quality' } }), { status: 400 })
    // a map left empty unsets the translations
    await u1Org.patch('/api/v1/datasets/i18n-1', { 'x-i18n-summary': { en: 'Quality' }, 'x-i18n-keywords': { en: [] } })
    dataset = (await u1Org.get('/api/v1/datasets/i18n-1')).data
    assert.deepEqual(dataset['x-i18n-summary'], { en: 'Quality' })
    assert.equal(dataset['x-i18n-keywords'], undefined)

    const en = (await u1Org.get('/api/v1/datasets/i18n-1', { params: { lang: 'en' } })).data
    assert.equal(en.title, 'Drinking water')
    assert.equal(en.summary, 'Quality')
    assert.deepEqual(en.keywords, ['eau'], 'a missing translation falls back on the base text')
    assert.equal(en.creator, 'Water directorate')
    assert.equal(en.spatial, 'Brittany')
    assert.ok(!Object.keys(en).some(k => k.startsWith('x-i18n-')))
    assert.equal(en.attachments[0].title, 'Manual')
    assert.ok(!Object.keys(en.attachments[0]).some(k => k.startsWith('x-i18n-')))
    // the markdown rendering cache must not mix the languages
    const frHtml = (await u1Org.get('/api/v1/datasets/i18n-1', { params: { html: true } })).data
    const enHtml = (await u1Org.get('/api/v1/datasets/i18n-1', { params: { html: true, lang: 'en' } })).data
    assert.equal(frHtml.attachments[0].description, '<p>Mode <em>emploi</em></p>')
    assert.equal(enHtml.attachments[0].description, '<p>How <em>to</em></p>')

    const list = (await u1Org.get('/api/v1/datasets', { params: { lang: 'en', select: 'title', owner: 'organization:test_datafair_org1' } })).data
    assert.equal(list.results[0].title, 'Drinking water')
    assert.ok(!('x-i18n-title' in list.results[0]))

    await assert.rejects(u1Org.get('/api/v1/datasets/i18n-1', { params: { lang: 'EN!' } }), { status: 400 })

    const search = (await u1Org.get('/api/v1/datasets', { params: { q: 'drinking', owner: 'organization:test_datafair_org1', select: 'id' } })).data
    assert.deepEqual(search.results.map((r: any) => r.id), ['i18n-1'])
  })

  test('column translations do not re-finalize a file dataset', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', u1Org)
    const patched = (await u1Org.patch('/api/v1/datasets/' + dataset.id, { schema: translatedSchema(dataset.schema) })).data
    assert.equal(patched.status, 'finalized')
    const column = patched.schema.find((p: any) => p.key === 'id')
    assert.deepEqual(column['x-i18n-title'], { en: 'Identifier' })
    assert.deepEqual(column['x-i18n-x-labels'], { en: { koumoul: 'Koumoul Ltd' } })

    const schema = (await u1Org.get(`/api/v1/datasets/${dataset.id}/schema`, { params: { lang: 'en' } })).data
    const enColumn = schema.find((p: any) => p.key === 'id')
    assert.equal(enColumn.label, 'Identifier')
    assert.deepEqual(enColumn['x-labels'], { koumoul: 'Koumoul Ltd' })
    const values = (await u1Org.get(`/api/v1/datasets/${dataset.id}/values-labels/id`, { params: { lang: 'en' } })).data
    assert.equal(values.find((v: any) => v.value === 'koumoul').label, 'Koumoul Ltd')
  })
})
