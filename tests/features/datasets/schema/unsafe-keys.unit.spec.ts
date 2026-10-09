import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { unsafeKeys } from '../../../../api/src/datasets/utils/operations.ts'

test.describe('unsafeKeys', () => {
  test('accepts normalized keys', () => {
    assert.deepEqual(unsafeKeys([{ key: 'note_c2' }, { key: 'nom_modele' }], []), [])
  })

  test('accepts un-normalized keys that are harmless to the index', () => {
    assert.deepEqual(unsafeKeys([{ key: 'dateCreation' }, { key: 'code_DEP' }, { key: 'Nom complet' }, { key: 'a-b' }], []), [])
  })

  test('reports a key containing a dot with its normalized form', () => {
    assert.deepEqual(unsafeKeys([{ key: 'note_c2.1' }], []), [{ key: 'note_c2.1', normalized: 'note_c21' }])
  })

  test('reports a key with a leading underscore, reserved for calculated columns', () => {
    assert.deepEqual(unsafeKeys([{ key: '_i' }], []), [{ key: '_i', normalized: 'i' }])
  })

  test('reports every offending key, not only the first one', () => {
    assert.deepEqual(
      unsafeKeys([{ key: 'ok' }, { key: 'a.b' }, { key: 'c.d' }], []),
      [{ key: 'a.b', normalized: 'ab' }, { key: 'c.d', normalized: 'cd' }]
    )
  })

  test('ignores keys already present in the dataset so existing datasets keep working', () => {
    assert.deepEqual(unsafeKeys([{ key: 'note_c2.1' }], ['note_c2.1']), [])
  })

  test('ignores calculated properties, which legitimately use _ and dots', () => {
    assert.deepEqual(
      unsafeKeys([{ key: '_file.content', 'x-calculated': true }, { key: '_geopoint', 'x-calculated': true }], []),
      []
    )
  })

  test('ignores extension properties, whose dot separates the prefix from the field', () => {
    assert.deepEqual(unsafeKeys([{ key: 'geo.lat', 'x-extension': 'geocoder/coord' }], []), [])
  })

  test('suggests the normalized form of the escape key algorithm declared by the dataset', () => {
    // the default algorithm drops the dot, legacy and compat-ods turn it into _
    assert.deepEqual(unsafeKeys([{ key: 'note_c2.1' }], [], 'legacy'), [{ key: 'note_c2.1', normalized: 'note_c2_1' }])
    assert.deepEqual(unsafeKeys([{ key: 'note_c2.1' }], [], 'compat-ods'), [{ key: 'note_c2.1', normalized: 'note_c2_1' }])
  })

  test('tolerates a missing schema', () => {
    assert.deepEqual(unsafeKeys(undefined, []), [])
  })
})
