import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { trimSettings } from '../../../api/src/settings/operations.ts'

test.describe('trimSettings', () => {
  test('trims topics, licenses, vocabulary, api keys and webhooks', () => {
    const settings: any = {
      topics: [{ id: 't', title: ' Énergie ' }],
      licenses: [{ title: ' ODbL ', href: ' https://odbl ' }],
      privateVocabulary: [{ id: 'v', title: ' Voc ', description: ' d ', tag: ' Tag ' }],
      apiKeys: [{ title: ' Key ' }],
      webhooks: [{ title: ' Hook ', target: { type: 'http', params: { url: ' https://hook ' } } }]
    }
    trimSettings(settings)
    assert.equal(settings.topics[0].title, 'Énergie')
    assert.deepEqual(settings.licenses[0], { title: 'ODbL', href: 'https://odbl' })
    assert.deepEqual(settings.privateVocabulary[0], { id: 'v', title: 'Voc', description: 'd', tag: 'Tag' })
    assert.equal(settings.apiKeys[0].title, 'Key')
    assert.equal(settings.webhooks[0].title, 'Hook')
    assert.equal(settings.webhooks[0].target.params.url, 'https://hook')
  })

  test('trims datasets metadata options and contact info', () => {
    const settings: any = {
      datasetsMetadata: {
        spatial: { active: true, title: ' Zone ' },
        custom: [{ key: ' ref ', title: ' Référence ' }]
      },
      info: { contact: { name: ' Koumoul ', url: ' https://koumoul.com ', email: ' contact@koumoul.com ' } }
    }
    trimSettings(settings)
    assert.equal(settings.datasetsMetadata.spatial.title, 'Zone')
    assert.deepEqual(settings.datasetsMetadata.custom[0], { key: 'ref', title: 'Référence' })
    assert.deepEqual(settings.info.contact, { name: 'Koumoul', url: 'https://koumoul.com', email: 'contact@koumoul.com' })
  })

  test('ignores absent fields', () => {
    const settings: any = { id: 'org' }
    trimSettings(settings)
    assert.deepEqual(settings, { id: 'org' })
  })
})
