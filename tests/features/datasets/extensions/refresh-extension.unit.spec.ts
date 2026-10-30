import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { refreshExtensionPatch } from '../../../../ui/src/utils/extensions.ts'

test.describe('refreshExtensionPatch', () => {
  const geocoder = { type: 'remoteService', active: true, remoteService: 'geocoder', action: 'postCoords', propertyPrefix: '_coords' }
  const siret = { type: 'remoteService', active: true, remoteService: 'dataset:sirene', action: 'masterData_bulkSearch_siret', propertyPrefix: '_siret' }
  const expr = { type: 'exprEval', active: true, expr: 'UPPER(name)', property: { key: 'upper_name' } }

  test('keeps the other extensions when refreshing one', () => {
    const patch = refreshExtensionPatch([geocoder, siret, expr], siret)
    assert.deepEqual(patch.extensions, [geocoder, { ...siret, needsUpdate: true }, expr])
  })

  test('sends the refreshed extension as edited in the form', () => {
    const edited = { ...siret, select: ['denomination'] }
    const patch = refreshExtensionPatch([geocoder, siret], edited)
    assert.deepEqual(patch.extensions[1], { ...edited, needsUpdate: true })
    assert.equal(patch.extensions[0], geocoder)
  })

  test('appends an extension added in the form but not saved yet', () => {
    const patch = refreshExtensionPatch([geocoder, expr], siret)
    assert.deepEqual(patch.extensions, [geocoder, expr, { ...siret, needsUpdate: true }])
  })
})
