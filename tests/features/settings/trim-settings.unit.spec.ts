import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { trimSettings, cleanDatasetsMetadata } from '../../../api/src/settings/operations.ts'

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
        custom: [{ key: ' ref ', title: ' Référence ', description: ' Référence interne du jeu. ', enum: [{ code: 'voi', label: ' Voirie ' }] }],
        groups: [{ key: 'g', title: ' Gouvernance ' }],
        informationsTitle: ' Général '
      },
      info: { contact: { name: ' Koumoul ', url: ' https://koumoul.com ', email: ' contact@koumoul.com ' } }
    }
    trimSettings(settings)
    assert.equal(settings.datasetsMetadata.spatial.title, 'Zone')
    assert.deepEqual(settings.datasetsMetadata.custom[0], { key: 'ref', title: 'Référence', description: 'Référence interne du jeu.', enum: [{ code: 'voi', label: 'Voirie' }] })
    assert.deepEqual(settings.datasetsMetadata.groups[0], { key: 'g', title: 'Gouvernance' })
    assert.equal(settings.datasetsMetadata.informationsTitle, 'Général')
    assert.deepEqual(settings.info.contact, { name: 'Koumoul', url: 'https://koumoul.com', email: 'contact@koumoul.com' })
  })

  test('ignores absent fields', () => {
    const settings: any = { id: 'org' }
    trimSettings(settings)
    assert.deepEqual(settings, { id: 'org' })
  })
})

test.describe('cleanDatasetsMetadata', () => {
  test('gives a key to the categories created without one and keeps the existing keys', () => {
    const datasetsMetadata: any = { groups: [{ key: 'gouv', title: 'Gouvernance' }, { title: 'Qualité' }] }
    cleanDatasetsMetadata(datasetsMetadata)
    assert.equal(datasetsMetadata.groups[0].key, 'gouv')
    assert.ok(datasetsMetadata.groups[1].key)
  })
})
