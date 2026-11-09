import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { localizedMetadata, standardMetadata } from '../../../ui/src/utils/settings-metadata-form.ts'

test.describe('settings metadata form', () => {
  test('lists the metadata the settings know, summary and conformsTo included', () => {
    const keys = standardMetadata.map(m => m.key)
    assert.ok(keys.includes('summary'))
    assert.ok(keys.includes('conformsTo'))
  })

  test('summary and description cannot change category', () => {
    const hasGroup = (key: string) => standardMetadata.find(m => m.key === key)?.hasGroup
    assert.equal(hasGroup('summary'), false)
    assert.equal(hasGroup('description'), false)
    assert.equal(hasGroup('license'), true)
  })

  test('titles follow the locale', () => {
    assert.equal(localizedMetadata('fr').image.title, 'Vignette')
    assert.equal(localizedMetadata('en').image.title, 'Thumbnail')
    assert.equal(localizedMetadata('en').summary.title, 'Summary')
  })
})
