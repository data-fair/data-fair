import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { unnormalizedKeys } from '../../../../api/src/datasets/utils/operations.ts'

test.describe('unnormalizedKeys', () => {
  test('accepts keys that are already normalized', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2' }, { key: 'nom_modele' }], []),
      []
    )
  })

  test('reports a key containing a dot with its normalized form', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2.1' }], []),
      [{ key: 'note_c2.1', normalized: 'note_c21' }]
    )
  })

  test('reports a key with a leading underscore, reserved for calculated columns', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: '_i' }], []),
      [{ key: '_i', normalized: 'i' }]
    )
  })

  test('reports every offending key, not only the first one', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: 'ok' }, { key: 'a.b' }, { key: 'c.d' }], []),
      [{ key: 'a.b', normalized: 'ab' }, { key: 'c.d', normalized: 'cd' }]
    )
  })

  test('ignores keys already present in the dataset so existing datasets keep working', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2.1' }], ['note_c2.1']),
      []
    )
  })

  test('ignores calculated properties, which legitimately use _ and dots', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: '_file.content', 'x-calculated': true }, { key: '_geopoint', 'x-calculated': true }], []),
      []
    )
  })

  test('ignores extension properties, whose dot separates the prefix from the field', () => {
    assert.deepEqual(
      unnormalizedKeys([{ key: 'geo.lat', 'x-extension': 'geocoder/coord' }], []),
      []
    )
  })

  test('uses the escape key algorithm declared by the dataset', () => {
    // the legacy algorithm replaces a dot with _ instead of dropping it
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2_1' }], [], 'legacy'),
      []
    )
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2.1' }], [], 'legacy'),
      [{ key: 'note_c2.1', normalized: 'note_c2_1' }]
    )
  })

  test('uses the compat-ods algorithm when the dataset declares it', () => {
    // compat-ods turns an unsupported character into _, where the default algorithm drops it
    // (default would suggest 'note_c21') — so the suggestion tells the two apart
    assert.deepEqual(
      unnormalizedKeys([{ key: 'note_c2.1' }], [], 'compat-ods'),
      [{ key: 'note_c2.1', normalized: 'note_c2_1' }]
    )
    assert.deepEqual(
      unnormalizedKeys([{ key: 'a-b' }], [], 'compat-ods'),
      [{ key: 'a-b', normalized: 'a_b' }]
    )
    assert.deepEqual(unnormalizedKeys([{ key: 'note_c2_1' }], [], 'compat-ods'), [])
  })

  test('tolerates a missing schema', () => {
    assert.deepEqual(unnormalizedKeys(undefined, []), [])
  })
})
