/**
 * Judged portal simulations: three runs offered a map view (« l'onglet Carte ») of a dataset
 * with no geographic data. describe_dataset said « Geolocalized: yes » when it was, and nothing
 * when it was not, so a model never read « no ». Both cases are now stated.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatResult } from '../../../agent-tools/describe-dataset.ts'

test.describe('describe_dataset says whether a dataset can be shown on a map', () => {
  test('says so for a dataset with geographic data', () => {
    const { text } = formatResult({ id: 'geo', title: 'Geo', status: 'finalized', count: 3, bbox: [1, 2, 3, 4] })
    assert.match(text, /\*\*Geolocalized:\*\* yes/)
  })

  test('says no, and no map, for a dataset without', () => {
    const { text } = formatResult({ id: 'flat', title: 'Flat', status: 'finalized', count: 3 })
    assert.match(text, /\*\*Geolocalized:\*\* no — it has no map view/)
  })
})
