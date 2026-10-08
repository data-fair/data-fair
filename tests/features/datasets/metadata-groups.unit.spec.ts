import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { fieldGroup, customGroup, usedGroups, modifiedGroups } from '../../../ui/src/utils/metadata-groups.ts'

const datasetsMetadata = {
  groups: [{ key: 'gouv', title: 'Gouvernance' }],
  spatial: { active: true, group: 'gouv' },
  keywords: { active: true, group: 'removed' },
  license: { group: 'coverage' },
  custom: [{ key: 'service', group: 'gouv' }, { key: 'ref', group: 'removed' }, { key: 'note' }]
}

test.describe('metadata groups', () => {
  test('a fixed metadata goes to its chosen category, else to its default one', () => {
    assert.equal(fieldGroup(datasetsMetadata, 'spatial'), 'gouv')
    assert.equal(fieldGroup(datasetsMetadata, 'license'), 'coverage')
    assert.equal(fieldGroup(datasetsMetadata, 'keywords'), 'coverage')
    assert.equal(fieldGroup(datasetsMetadata, 'creator'), 'informations')
    assert.equal(fieldGroup(datasetsMetadata, 'temporal'), 'coverage')
    assert.equal(fieldGroup(datasetsMetadata, 'title'), 'informations')
    assert.equal(fieldGroup(null, 'relatedDatasets'), 'coverage')
    assert.equal(fieldGroup(null, 'image'), 'coverage')
    assert.equal(fieldGroup(null, 'topics'), 'informations')
  })

  test('a custom metadata goes to its chosen category, else to informations', () => {
    assert.equal(customGroup(datasetsMetadata, 'service'), 'gouv')
    assert.equal(customGroup(datasetsMetadata, 'ref'), 'informations')
    assert.equal(customGroup(datasetsMetadata, 'note'), 'informations')
    assert.equal(customGroup(datasetsMetadata, 'unknown'), 'informations')
  })

  test('a category holding no active metadata is not used', () => {
    assert.deepEqual([...usedGroups({ ...datasetsMetadata, groups: [...datasetsMetadata.groups, { key: 'empty', title: 'Vide' }] })].sort(), ['coverage', 'gouv', 'informations'])
    // image, related datasets and search terms (active by default) moved out: the coverage tab is empty
    const moved = { image: { group: 'informations' }, relatedDatasets: { group: 'informations' }, searchTerms: { active: false } }
    assert.deepEqual([...usedGroups(moved)], ['informations'])
  })

  test('the modified categories are the ones holding a changed field', () => {
    const serverData = { title: 'a', spatial: 'France', temporal: null, customMetadata: { service: 'Voirie' } }
    assert.deepEqual([...modifiedGroups(datasetsMetadata, structuredClone(serverData), serverData)], [])
    assert.deepEqual(
      [...modifiedGroups(datasetsMetadata, { ...serverData, temporal: { start: '2026-01-01' } }, serverData)],
      ['coverage']
    )
    assert.deepEqual(
      [...modifiedGroups(datasetsMetadata, { ...serverData, title: 'b', customMetadata: { service: 'Urbanisme', note: 'x' } }, serverData)].sort(),
      ['gouv', 'informations']
    )
  })
})
